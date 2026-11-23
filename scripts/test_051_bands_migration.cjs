// Verifies migration 051 (setup_items gains nullable start_time and copy_key, for bands) on a COPY
// of a real database, running the REAL migration code (transpiled from TS via esbuild) the way
// migrate.ts runs it: foreign keys off, one transaction, then PRAGMA foreign_key_check.
//
// Run with Electron's Node, so better-sqlite3 keeps its Electron build (no rebuild dance):
//   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/test_051_bands_migration.cjs [db]
// [db] defaults to the demo profile's database. It is only read: the test works on a temp copy.
// If that database already ran 051 (a dev build migrates it on launch), the copy has the two
// columns dropped first, so the migration still runs against a pre-051 shape.
const Database = require('better-sqlite3')
const esbuild = require('esbuild')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const source =
  process.argv[2] ??
  path.join(os.homedir(), 'Library/Application Support/Setup Sheet Helper (Demo)/setup-sheet-helper.sqlite')

const tsSource = fs.readFileSync(path.join(__dirname, '../src/main/db/migrations/051_bands.ts'), 'utf8')
const mod = new Module('051_bands')
mod._compile(esbuild.transformSync(tsSource, { loader: 'ts', format: 'cjs' }).code, '051_bands.js')
const runMigration = mod.exports.run

const copyPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'migration-051-')), 'copy.sqlite')
const src = new Database(source, { readonly: true, fileMustExist: true })
src.exec(`VACUUM INTO '${copyPath.replace(/'/g, "''")}'`)
src.close()

const db = new Database(copyPath)
let failures = 0
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

const columns = () => db.pragma('table_info(setup_items)').map((c) => c.name)
for (const col of ['start_time', 'copy_key']) {
  if (columns().includes(col)) db.exec(`ALTER TABLE setup_items DROP COLUMN ${col}`)
}
check('columns absent before', !columns().includes('start_time') && !columns().includes('copy_key'))
const rows = () => db.prepare('SELECT * FROM setup_items ORDER BY id').all()
const before = rows()

db.pragma('foreign_keys = OFF')
db.transaction(() => {
  runMigration(db)
  const violations = db.pragma('foreign_key_check')
  if (violations.length > 0) throw new Error(`${violations.length} broken foreign key reference(s)`)
})()
db.pragma('foreign_keys = ON')

for (const name of ['start_time', 'copy_key']) {
  const col = db.pragma('table_info(setup_items)').find((c) => c.name === name)
  check(`${name} is a nullable TEXT column`, col?.type === 'TEXT' && col.notnull === 0, JSON.stringify(col))
}
const after = rows()
check('existing rows read as no band data', after.every((r) => r.start_time === null && r.copy_key === null), `${after.length} rows`)
check(
  'existing values unchanged',
  JSON.stringify(after.map(({ start_time, copy_key, ...rest }) => rest)) === JSON.stringify(before),
  `${before.length} rows`
)

// Round-trip a divider and a copied row through the columns.
let studioId = db.prepare('SELECT id FROM studios ORDER BY id LIMIT 1').get()?.id
if (studioId == null) studioId = db.prepare("INSERT INTO studios (name) VALUES ('051 test')").run().lastInsertRowid
const setupId = db.prepare("INSERT INTO setups (studio_id, name) VALUES (?, '051 test')").run(studioId).lastInsertRowid
const insert = db.prepare(
  `INSERT INTO setup_items (setup_id, instrument_type, source_name, start_time, copy_key, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
)
insert.run(setupId, 'band_divider', 'Jazz Trio', '7:00 pm', null, 0)
insert.run(setupId, 'custom_source', 'Kick', null, 'key-1', 1)
const saved = db.prepare('SELECT instrument_type, source_name, start_time, copy_key FROM setup_items WHERE setup_id = ? ORDER BY sort_order').all(setupId)
check(
  'divider and copy key round-trip',
  JSON.stringify(saved) ===
    JSON.stringify([
      { instrument_type: 'band_divider', source_name: 'Jazz Trio', start_time: '7:00 pm', copy_key: null },
      { instrument_type: 'custom_source', source_name: 'Kick', start_time: null, copy_key: 'key-1' }
    ]),
  JSON.stringify(saved)
)
check('integrity ok', db.pragma('integrity_check', { simple: true }) === 'ok')

db.close()
fs.rmSync(path.dirname(copyPath), { recursive: true, force: true })
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
