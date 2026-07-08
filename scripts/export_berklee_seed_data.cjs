// Regenerates src/main/db/migrations/berkleeSeedData.json from the live DB's institutional
// Berklee data (buildings; studios WHERE building_id IS NOT NULL; mics WHERE pool_type IN
// ('studio','building','faculty_reserve'); outboard_gear WHERE pool_type='studio'). Run this
// any time real data changes (e.g. Faculty Reserve or Building Office gear gets added) and
// before the next build, so fresh installs stay in sync with the developer's live DB.
//
// Usage: node scripts/export_berklee_seed_data.cjs <path-to-sqlite-file>

const Database = require('better-sqlite3')
const fs = require('node:fs')
const path = require('node:path')

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('Usage: node scripts/export_berklee_seed_data.cjs <path-to-sqlite-file>')
  process.exit(1)
}

const db = new Database(dbPath, { readonly: true })

const buildings = db.prepare('SELECT name FROM buildings ORDER BY id').all()

const studios = db
  .prepare(
    `SELECT b.name AS buildingName, s.name AS name
     FROM studios s JOIN buildings b ON b.id = s.building_id
     WHERE s.building_id IS NOT NULL
     ORDER BY s.id`
  )
  .all()

const micRows = db
  .prepare(
    `SELECT m.pool_type AS poolType, sb.name AS buildingNameViaStudio, s.name AS studioName,
            bb.name AS buildingNameDirect, m.name, m.manufacturer, m.category, m.notes,
            m.quantity, m.sort_order AS sortOrder
     FROM mics m
     LEFT JOIN studios s ON s.id = m.studio_id
     LEFT JOIN buildings sb ON sb.id = s.building_id
     LEFT JOIN buildings bb ON bb.id = m.building_id
     WHERE m.pool_type IN ('studio', 'building', 'faculty_reserve')
     ORDER BY m.id`
  )
  .all()

const mics = micRows.map((r) => ({
  poolType: r.poolType,
  buildingName: r.poolType === 'building' ? r.buildingNameDirect : r.poolType === 'studio' ? r.buildingNameViaStudio : null,
  studioName: r.poolType === 'studio' ? r.studioName : null,
  name: r.name,
  manufacturer: r.manufacturer,
  category: r.category,
  notes: r.notes,
  quantity: r.quantity,
  sortOrder: r.sortOrder
}))

const outboard = db
  .prepare(
    `SELECT b.name AS buildingName, s.name AS studioName, o.name, o.manufacturer, o.category, o.notes,
            o.quantity, o.sort_order AS sortOrder
     FROM outboard_gear o
     JOIN studios s ON s.id = o.studio_id
     JOIN buildings b ON b.id = s.building_id
     WHERE o.pool_type = 'studio'
     ORDER BY o.id`
  )
  .all()

const outPath = path.join(__dirname, '..', 'src', 'main', 'db', 'migrations', 'berkleeSeedData.json')
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'live DB export via scripts/export_berklee_seed_data.cjs',
      buildings,
      studios,
      mics,
      outboard
    },
    null,
    2
  ) + '\n'
)

console.log(
  `Wrote ${buildings.length} buildings, ${studios.length} studios, ${mics.length} mics, ${outboard.length} outboard rows to ${outPath}`
)
db.close()
