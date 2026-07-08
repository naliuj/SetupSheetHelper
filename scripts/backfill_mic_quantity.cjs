// Fixes mics rows (pool_type='studio') that have quantity = 0 — the picker treats an item as
// "at capacity" once used >= quantity, so a quantity of 0 makes every such mic permanently
// unselectable/grayed out even with zero uses. Personal/setup-pool mics and all outboard_gear
// rows already default to 1+; only studio-pool mics were affected, apparently never given a
// real quantity when originally seeded. Backfills them to 1 (a safe default matching how
// every other pool already behaves) — does not touch rows that already have a real quantity.
//
// Usage: node scripts/backfill_mic_quantity.cjs <path-to-sqlite-file>

const Database = require('better-sqlite3')

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('Usage: node scripts/backfill_mic_quantity.cjs <path-to-sqlite-file>')
  process.exit(1)
}

console.log(`Backfilling: ${dbPath}`)

const db = new Database(dbPath)
const info = db.prepare("UPDATE mics SET quantity = 1 WHERE quantity <= 0").run()
console.log(`mics: ${info.changes} row(s) updated to quantity = 1`)

db.close()
console.log('done')
