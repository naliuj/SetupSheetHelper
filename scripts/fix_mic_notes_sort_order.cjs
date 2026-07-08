// Fixes pre-existing data corruption discovered while building the Berklee seed-data export:
// every pool_type='studio' mic row has `notes` holding its quantity as text (e.g. "2") and
// `sort_order` holding its manufacturer name as text (e.g. "AKG") instead of notes being empty
// and sort_order being a number. Predates this session's scripts — none of them ever wrote to
// either column for mics. Clears notes to NULL and sort_order to 0 for affected rows only
// (guarded by comparing against the current quantity/manufacturer values, so it won't touch
// any row that's actually correct).
//
// Usage: node scripts/fix_mic_notes_sort_order.cjs <path-to-sqlite-file>

const Database = require('better-sqlite3')

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('Usage: node scripts/fix_mic_notes_sort_order.cjs <path-to-sqlite-file>')
  process.exit(1)
}

console.log(`Fixing: ${dbPath}`)

const db = new Database(dbPath)

const info = db
  .prepare(
    `UPDATE mics
     SET notes = NULL, sort_order = 0
     WHERE pool_type = 'studio'
       AND notes = CAST(quantity AS TEXT)
       AND sort_order = manufacturer`
  )
  .run()

console.log(`Fixed ${info.changes} row(s).`)

db.close()
console.log('done')
