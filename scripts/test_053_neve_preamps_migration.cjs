// Verifies migration 053 (Neve preamps in Studios 1 and 3) on a COPY of a real database, running the
// REAL migration code (transpiled from TS via esbuild) inside one transaction, as migrate.ts does.
//
//   node scripts/test_053_neve_preamps_migration.cjs [db]
// [db] defaults to the demo profile's database. It is only read: the test works on a temp copy.
const Database = require('better-sqlite3')
const esbuild = require('esbuild')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const source =
  process.argv[2] ??
  path.join(os.homedir(), 'Library/Application Support/Setup Sheet Helper (Demo)/setup-sheet-helper.sqlite')

const tsSource = fs.readFileSync(path.join(__dirname, '../src/main/db/migrations/053_neve_preamps.ts'), 'utf8')
const mod = new Module('053_neve_preamps')
mod._compile(esbuild.transformSync(tsSource, { loader: 'ts', format: 'cjs' }).code, '053_neve_preamps.js')
const runMigration = mod.exports.run

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-053-'))
const copy = (name) => {
  const p = path.join(dir, name)
  const src = new Database(source, { readonly: true, fileMustExist: true })
  src.exec(`VACUUM INTO '${p.replace(/'/g, "''")}'`)
  src.close()
  return new Database(p)
}

let failures = 0
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

const rows = (db, studio, name) =>
  db
    .prepare(
      `SELECT p.channels FROM preamps p JOIN studios s ON s.id = p.studio_id
         JOIN buildings b ON b.id = s.building_id
        WHERE b.name = '160' AND s.name = ? AND p.name = ?`
    )
    .all(studio, name)
    .map((r) => r.channels)
const all = (db) => db.prepare('SELECT id, studio_id, name, channels FROM preamps ORDER BY id').all()

// 1. The stale seeded state: Studio 1 has no Neve, Studio 3's 1084 is 1 channel.
const db = copy('a.sqlite')
if (rows(db, 'Studio 3', 'Neve 1084').length !== 1) {
  console.log('This database has no seeded Berklee preamps to test against.')
  process.exit(1)
}
db.prepare("DELETE FROM preamps WHERE name IN ('Neve 1073', 'Neve 1084') AND studio_id = (SELECT s.id FROM studios s JOIN buildings b ON b.id = s.building_id WHERE b.name = '160' AND s.name = 'Studio 1')").run()
db.prepare("UPDATE preamps SET channels = 1 WHERE name = 'Neve 1084' AND studio_id = (SELECT s.id FROM studios s JOIN buildings b ON b.id = s.building_id WHERE b.name = '160' AND s.name = 'Studio 3')").run()
const before = all(db)

db.transaction(() => runMigration(db))()

check('Studio 1 has Neve 1073 at 2 channels', JSON.stringify(rows(db, 'Studio 1', 'Neve 1073')) === '[2]')
check('Studio 1 has Neve 1084 at 2 channels', JSON.stringify(rows(db, 'Studio 1', 'Neve 1084')) === '[2]')
check('Studio 3 Neve 1084 is 2 channels', JSON.stringify(rows(db, 'Studio 3', 'Neve 1084')) === '[2]')
const after = all(db)
const changedOld = before.filter((r) => {
  const a = after.find((x) => x.id === r.id)
  return !a || a.channels !== r.channels || a.name !== r.name
})
check('only Studio 3 Neve 1084 changed among existing rows', changedOld.length === 1, `${changedOld.length} changed`)
check('two rows added', after.length === before.length + 2, `${after.length - before.length} added`)

db.transaction(() => runMigration(db))()
check('a second run adds and changes nothing', JSON.stringify(all(db)) === JSON.stringify(after))
db.close()

// 2. Hand-set values are kept: Studio 3's 1084 set to 4, Studio 1 already lists a "neve 1073".
const db2 = copy('b.sqlite')
const s1 = db2.prepare("SELECT s.id FROM studios s JOIN buildings b ON b.id = s.building_id WHERE b.name = '160' AND s.name = 'Studio 1'").get().id
db2.prepare("DELETE FROM preamps WHERE studio_id = ? AND name IN ('Neve 1073', 'Neve 1084')").run(s1)
db2.prepare("INSERT INTO preamps (pool_type, studio_id, name, manufacturer, channels, sort_order) VALUES ('studio', ?, 'neve 1073', 'Neve', 1, 0)").run(s1)
db2.prepare("UPDATE preamps SET channels = 4 WHERE name = 'Neve 1084' AND studio_id = (SELECT s.id FROM studios s JOIN buildings b ON b.id = s.building_id WHERE b.name = '160' AND s.name = 'Studio 3')").run()
db2.transaction(() => runMigration(db2))()
check('a hand-set Studio 3 count is kept', JSON.stringify(rows(db2, 'Studio 3', 'Neve 1084')) === '[4]')
check('an existing Studio 1 1073 is not doubled', db2.prepare("SELECT count(*) n FROM preamps WHERE studio_id = ? AND lower(name) = 'neve 1073'").get(s1).n === 1)
check('the missing Studio 1 1084 is still added', JSON.stringify(rows(db2, 'Studio 1', 'Neve 1084')) === '[2]')
db2.close()

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
