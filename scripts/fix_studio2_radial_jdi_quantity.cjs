// Corrects mic id 195 (Radial JDI Passive, Studio 2/The Ark) from quantity 1 back to 4.
// It was defaulted to 1 by backfill_mic_quantity_berklee.cjs because it wasn't explicitly
// listed in that studio's fetched page summary. Recovered while fixing the notes/sort_order
// corruption (scripts/fix_mic_notes_sort_order.cjs) — the row's corrupted `notes` column still
// held its pre-corruption quantity as text ("4"), consistent with Studio 1 (qty 6) and Studio 3
// (qty 4) both stocking the same item.
//
// Usage: node scripts/fix_studio2_radial_jdi_quantity.cjs <path-to-sqlite-file>

const Database = require('better-sqlite3')

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('Usage: node scripts/fix_studio2_radial_jdi_quantity.cjs <path-to-sqlite-file>')
  process.exit(1)
}

const db = new Database(dbPath)
const row = db.prepare('SELECT id, name, manufacturer, quantity FROM mics WHERE id = 195').get()
if (!row || row.manufacturer !== 'Radial' || row.name !== 'JDI Passive') {
  console.error('Expected row id=195 to be Radial JDI Passive, found:', row)
  process.exit(1)
}

const info = db.prepare('UPDATE mics SET quantity = 4 WHERE id = 195').run()
console.log(`Updated ${info.changes} row: Radial JDI Passive (id 195) quantity -> 4`)

db.close()
console.log('done')
