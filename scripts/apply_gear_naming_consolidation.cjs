// Applies the user-reviewed gear naming consolidation (auto_merge + the explicit rename
// actions from needs_manual_check) from gear_consolidation.json. Targets exact row ids
// (verified against a fresh DB dump immediately before writing this script) rather than
// re-matching by name/manufacturer at execution time, so there's no risk of an unexpected
// row being caught by a broader match.
//
// Mic names do NOT include the manufacturer prefix in this dataset's existing convention
// (e.g. "C535 EB", not "AKG C535 EB") — canonical values from the consolidation list are
// stripped of their manufacturer prefix before being written. Outboard names DO already
// include the manufacturer prefix by convention (e.g. "Universal Audio 1176LN") — those are
// used as-is.
//
// Usage: node scripts/apply_gear_naming_consolidation.cjs [--live]
// Without --live, runs against a temporary copy of the DB and reports what WOULD change.
// With --live, applies to the real database (still wrapped in one transaction).
const Database = require('better-sqlite3')
const fs = require('node:fs')
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

const MIC_RENAMES = [
  [45, 'C535 EB'],
  [83, 'C535 EB'],
  [132, 'C414 XLII'],
  [172, 'C414 XLII'],
  [211, 'C414 XLII'],
  [82, 'C414 XLII'],
  [11, 'AT4050/CM5'],
  [87, 'AT4050/CM5'],
  [177, 'AT5047'],
  [151, 'TLM 170 R'],
  [192, 'TLM 170 R'],
  [64, 'e902'],
  [29, 'MD 421'],
  [65, 'MD 421'],
  [162, 'MD 421'],
  [203, 'MD 421'],
  [233, 'MD 421'],
  [30, 'MD 441-U'],
  [66, 'MD 441-U'],
  [108, 'MD 441-U'],
  [72, 'KSM27'],
  [110, 'KSM27'],
  [73, 'KSM44'],
  [111, 'KSM44'],
  [71, 'KSM141'],
  [126, 'KSM141'],
  [153, 'U87 Ai'],
  [226, 'U87 Ai'],
  [194, 'U87 Ai'],
  [173, 'C451B'],
  [47, 'AT-3032'],
  [31, 'Beta 52A'],
  [109, 'Beta 52A'],
  [124, 'Beta 52A'],
  [164, 'Beta 52A'],
  [204, 'Beta 52A'],
  [234, 'Beta 52A'],
  [144, '4038'],
  [42, 'C414 B-ULS'],
  [3, 'C414 XLS'],
  [43, 'C414 XLS'],
  [5, 'C460B w/ CK61-ULS'],
  [6, 'C460B w/ CK1']
]

const OUTBOARD_RENAMES = [
  [1, 'API 2500'],
  [61, 'API 550b'],
  [90, 'API 550b'],
  [40, 'Universal Audio 1176LN'],
  [65, 'Universal Audio 1176LN'],
  [10, 'Lexicon 224X'],
  [31, 'Lexicon 224X']
]

function applyRenames(db, table, renames) {
  const select = db.prepare(`SELECT id, name, manufacturer FROM ${table} WHERE id = ?`)
  const update = db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`)
  const changes = []
  for (const [id, newName] of renames) {
    const row = select.get(id)
    if (!row) {
      changes.push({ id, table, before: '(ROW NOT FOUND)', after: newName, manufacturer: '?' })
      continue
    }
    changes.push({ id, table, before: row.name, after: newName, manufacturer: row.manufacturer })
    update.run(newName, id)
  }
  return changes
}

function run(dbPath, live) {
  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  const allChanges = []
  const apply = db.transaction(() => {
    allChanges.push(...applyRenames(db, 'mics', MIC_RENAMES))
    allChanges.push(...applyRenames(db, 'outboard_gear', OUTBOARD_RENAMES))
  })
  apply()

  console.log(`\n${live ? 'LIVE RUN' : 'DRY RUN (temp copy)'} — ${allChanges.length} rows updated:\n`)
  for (const c of allChanges) {
    const marker = c.before === c.after ? '(unchanged)' : ''
    console.log(`  ${c.table} #${c.id} [${c.manufacturer}]  "${c.before}"  ->  "${c.after}"  ${marker}`)
  }

  const noOps = allChanges.filter((c) => c.before === c.after)
  const notFound = allChanges.filter((c) => c.before === '(ROW NOT FOUND)')
  console.log(`\nSummary: ${allChanges.length} total, ${noOps.length} already correct, ${notFound.length} not found.`)

  db.close()
}

const live = process.argv.includes('--live')

if (live) {
  run(getDbPath(), true)
} else {
  const tmpPath = path.join(os.tmpdir(), `setup-sheet-helper-gear-rename-dryrun-${Date.now()}.sqlite`)
  fs.copyFileSync(getDbPath(), tmpPath)
  run(tmpPath, false)
  fs.unlinkSync(tmpPath)
  console.log('\n(Dry run only — the real database was not touched. Re-run with --live to apply.)')
}
