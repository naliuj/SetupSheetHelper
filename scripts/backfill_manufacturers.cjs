const Database = require('better-sqlite3')
const path = require('node:path')
const os = require('node:os')

function getDbPath() {
  const platform = process.platform
  const appName = 'setup-sheet-helper'
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName, `${appName}.sqlite`)
  }
  if (platform === 'win32') {
    return path.join(process.env.APPDATA || '', appName, `${appName}.sqlite`)
  }
  return path.join(os.homedir(), '.config', appName, `${appName}.sqlite`)
}

// Longest-prefix-match first — duplicated here (rather than importing the TS module) so this
// one-off script has no build step; keep in sync with src/shared/constants/manufacturers.ts.
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

function backfillTable(db, table) {
  const rows = db.prepare(`SELECT id, name FROM ${table} WHERE manufacturer IS NULL`).all()
  const update = db.prepare(`UPDATE ${table} SET manufacturer = ? WHERE id = ?`)

  let matched = 0
  let blank = 0
  for (const row of rows) {
    const guess = guessManufacturer(row.name)
    if (guess) {
      update.run(guess, row.id)
      matched++
    } else {
      blank++
    }
  }
  console.log(`${table}: ${matched} matched, ${blank} left blank (review in admin UI)`)
}

const db = new Database(getDbPath())
backfillTable(db, 'mics')
backfillTable(db, 'outboard_gear')
db.close()
