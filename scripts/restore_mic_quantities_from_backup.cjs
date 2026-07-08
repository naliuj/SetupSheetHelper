// Restores studio-pool mic quantities from scripts/berklee_mic_quantities_backup.json — use
// this if the quantities ever get wiped/corrupted again (e.g. a bad import). Matches rows by
// studio name + manufacturer + mic name (not by row id, since ids can differ across DBs/imports).
// Rows in the backup with no matching DB row are reported and skipped, not created.
//
// Usage: node scripts/restore_mic_quantities_from_backup.cjs <path-to-sqlite-file> [path-to-backup-json]

const Database = require('better-sqlite3')
const fs = require('node:fs')
const path = require('node:path')

const dbPath = process.argv[2]
const backupPath = process.argv[3] || path.join(__dirname, 'berklee_mic_quantities_backup.json')

if (!dbPath) {
  console.error('Usage: node scripts/restore_mic_quantities_from_backup.cjs <path-to-sqlite-file> [path-to-backup-json]')
  process.exit(1)
}

const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
console.log(`Restoring from: ${backupPath} (generated ${backup.generatedAt})`)
console.log(`Applying to: ${dbPath}`)

const db = new Database(dbPath)
const findRow = db.prepare(`
  SELECT m.id FROM mics m JOIN studios s ON s.id = m.studio_id
  WHERE s.name = ? AND m.pool_type = 'studio' AND m.manufacturer = ? AND m.name = ?
`)
const update = db.prepare('UPDATE mics SET quantity = ? WHERE id = ?')

let updated = 0
let notFound = 0
for (const [studio, mics] of Object.entries(backup.studios)) {
  for (const mic of mics) {
    const row = findRow.get(studio, mic.manufacturer, mic.name)
    if (!row) {
      console.warn(`  not found: ${studio} / ${mic.manufacturer} ${mic.name}`)
      notFound++
      continue
    }
    update.run(mic.quantity, row.id)
    updated++
  }
}

console.log(`Restored ${updated} rows, ${notFound} not found (skipped).`)

db.close()
console.log('done')
