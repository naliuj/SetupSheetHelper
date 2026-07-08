// Adds studios.faculty_reserve_enabled — lets a custom (non-Berklee) studio opt into seeing
// Faculty Reserve gear, which otherwise only shows up by default for real Berklee studios
// (building_id IS NOT NULL). Plain additive ALTER TABLE, no rebuild needed.
//
// Usage: node scripts/migrate_studio_faculty_reserve_override.cjs <path-to-sqlite-file>

const Database = require('better-sqlite3')

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('Usage: node scripts/migrate_studio_faculty_reserve_override.cjs <path-to-sqlite-file>')
  process.exit(1)
}

console.log(`Migrating: ${dbPath}`)

const db = new Database(dbPath)
db.exec('ALTER TABLE studios ADD COLUMN faculty_reserve_enabled INTEGER NOT NULL DEFAULT 0')

console.log('--- studios columns ---')
console.log(db.prepare('PRAGMA table_info(studios)').all().map((c) => c.name))
console.log('studios count:', db.prepare('SELECT COUNT(*) c FROM studios').get().c)

db.close()
console.log('done')
