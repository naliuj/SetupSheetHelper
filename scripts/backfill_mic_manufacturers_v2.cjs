// Backfills `manufacturer` on mics/outboard_gear rows that are missing it, guessed from a
// prefix-match against `name` (see src/shared/constants/manufacturers.ts, duplicated here since
// this one-off script has no build step). Unlike scripts/backfill_manufacturers.cjs (which only
// set `manufacturer` and never touched `name`), this also strips the now-redundant manufacturer
// prefix off `name` so results are consistent with how manually-added gear is stored (see
// src/shared/utils/manufacturerPrefix.ts). Supersedes backfill_manufacturers.cjs for this purpose;
// that script is left in place as-is.
//
// Usage: node scripts/backfill_mic_manufacturers_v2.cjs <path-to-sqlite-file>

const Database = require('better-sqlite3')

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('Usage: node scripts/backfill_mic_manufacturers_v2.cjs <path-to-sqlite-file>')
  process.exit(1)
}

console.log(`Backfilling: ${dbPath}`)

// Longest-prefix-match first — kept in sync with src/shared/constants/manufacturers.ts.
const RAW_MANUFACTURER_PREFIXES = [
  'Electro-Voice', 'Universal Audio', 'Audio Technica', 'Beyerdynamic', 'Tube-Tech',
  'Studio Technologies', 'Chandler Limited', 'Chandler', 'Tech21', 'Tech 21', 'Empirical Labs',
  'TC Electronic', 'True Systems', 'TRUE Systems', 'Summit Audio', 'Summit', 'Undertone Audio',
  'Groove Tubes', 'Crane Song', 'Millennia Media', 'Crowley and Tripp', 'B&K', 'DPA', 'AEA',
  'Coles', 'Schoeps', 'Sanken', 'Royer', 'Brauner', 'Countryman', 'Crown', 'Earthworks', 'Jensen',
  'Soyuz', 'Bricasti', 'Avalon', 'Kerwax', 'AKG', 'Shure', 'Neumann', 'Sennheiser', 'Audix', 'API',
  'Neve', 'Lexicon', 'Lexion', 'Drawmer', 'Eventide', 'Pultec', 'UREI', 'MXL', 'Sony', 'Yamaha',
  'Roland', 'Rode', 'ADK', 'GML', 'DBX', 'SSL', 'Warm', 'Radial'
]
const MANUFACTURER_PREFIXES = [...RAW_MANUFACTURER_PREFIXES].sort((a, b) => b.length - a.length)

function guessManufacturer(name) {
  const normalized = name.trim().toLowerCase()
  for (const prefix of MANUFACTURER_PREFIXES) {
    if (normalized.startsWith(prefix.toLowerCase())) return prefix
  }
  return null
}

// Mirrors src/shared/utils/manufacturerPrefix.ts stripManufacturerPrefix().
function stripManufacturerPrefix(name, manufacturer) {
  const prefix = manufacturer.trim()
  if (!prefix) return name
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const stripped = name.replace(new RegExp(`^${escaped}\\s+`, 'i'), '').trim()
  return stripped || name
}

function backfillTable(db, table) {
  const rows = db
    .prepare(`SELECT id, name FROM ${table} WHERE manufacturer IS NULL OR TRIM(manufacturer) = ''`)
    .all()
  const update = db.prepare(`UPDATE ${table} SET manufacturer = ?, name = ? WHERE id = ?`)

  let matched = 0
  let blank = 0
  for (const row of rows) {
    const guess = guessManufacturer(row.name)
    if (guess) {
      const strippedName = stripManufacturerPrefix(row.name, guess)
      update.run(guess, strippedName, row.id)
      matched++
    } else {
      blank++
    }
  }
  console.log(`${table}: ${matched} matched and updated, ${blank} left blank (still "Other" — review manually)`)
}

const db = new Database(dbPath)
const backfill = db.transaction(() => {
  backfillTable(db, 'mics')
  backfillTable(db, 'outboard_gear')
})
backfill()
db.close()
console.log('done')
