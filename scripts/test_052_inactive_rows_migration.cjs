// Verifies migration 052 (setup_items gains inactive INTEGER NOT NULL DEFAULT 0, for rows that are
// off in a band) on a COPY of a real database, running the REAL migration code (transpiled from TS
// via esbuild) the way migrate.ts runs it: foreign keys off, one transaction, then
// PRAGMA foreign_key_check.
//
// Run with Electron's Node, so better-sqlite3 keeps its Electron build (no rebuild dance):
//   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/test_052_inactive_rows_migration.cjs [db]
// [db] defaults to the demo profile's database. It is only read: the test works on a temp copy.
// If that database already ran 052, the copy has the column dropped first.
const Database = require('better-sqlite3')
const esbuild = require('esbuild')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const source =
  process.argv[2] ??
  path.join(os.homedir(), 'Library/Application Support/Setup Sheet Helper (Demo)/setup-sheet-helper.sqlite')

const tsSource = fs.readFileSync(path.join(__dirname, '../src/main/db/migrations/052_inactive_rows.ts'), 'utf8')
const mod = new Module('052_inactive_rows')
mod._compile(esbuild.transformSync(tsSource, { loader: 'ts', format: 'cjs' }).code, '052_inactive_rows.js')
const runMigration = mod.exports.run

const copyPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'migration-052-')), 'copy.sqlite')
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
if (columns().includes('inactive')) db.exec('ALTER TABLE setup_items DROP COLUMN inactive')
check('column absent before', !columns().includes('inactive'))
const rows = () => db.prepare('SELECT * FROM setup_items ORDER BY id').all()
const before = rows()

db.pragma('foreign_keys = OFF')
db.transaction(() => {
  runMigration(db)
  const violations = db.pragma('foreign_key_check')
  if (violations.length > 0) throw new Error(`${violations.length} broken foreign key reference(s)`)
})()
db.pragma('foreign_keys = ON')

const col = db.pragma('table_info(setup_items)').find((c) => c.name === 'inactive')
check('inactive is INTEGER NOT NULL DEFAULT 0', col?.type === 'INTEGER' && col.notnull === 1 && col.dflt_value === '0', JSON.stringify(col))
const after = rows()
check('existing rows read as on', after.every((r) => r.inactive === 0), `${after.length} rows`)
check(
  'existing values unchanged',
  JSON.stringify(after.map(({ inactive, ...rest }) => rest)) === JSON.stringify(before),
  `${before.length} rows`
)

// A row inserted without the column reads as on; one saved off reads back off.
let studioId = db.prepare('SELECT id FROM studios ORDER BY id LIMIT 1').get()?.id
if (studioId == null) studioId = db.prepare("INSERT INTO studios (name) VALUES ('052 test')").run().lastInsertRowid
const setupId = db.prepare("INSERT INTO setups (studio_id, name) VALUES (?, '052 test')").run(studioId).lastInsertRowid
db.prepare("INSERT INTO setup_items (setup_id, instrument_type, source_name, sort_order) VALUES (?, 'custom_source', 'Kick', 0)").run(setupId)
db.prepare("INSERT INTO setup_items (setup_id, instrument_type, source_name, inactive, sort_order) VALUES (?, 'custom_source', 'Banjo', 1, 1)").run(setupId)
const saved = db.prepare('SELECT source_name, inactive FROM setup_items WHERE setup_id = ? ORDER BY sort_order').all(setupId)
check(
  'default and saved values round-trip',
  JSON.stringify(saved) === JSON.stringify([{ source_name: 'Kick', inactive: 0 }, { source_name: 'Banjo', inactive: 1 }]),
  JSON.stringify(saved)
)
check('integrity ok', db.pragma('integrity_check', { simple: true }) === 'ok')

db.close()
fs.rmSync(path.dirname(copyPath), { recursive: true, force: true })
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
