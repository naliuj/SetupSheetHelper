// Verifies migration 050 (channel_preset_items gains a nullable pair_key) on a COPY of a real
// database, running the REAL migration code (transpiled from TS via esbuild) the way migrate.ts
// runs it: foreign keys off, one transaction, then PRAGMA foreign_key_check.
//
// Run with Electron's Node, so better-sqlite3 keeps its Electron build (no rebuild dance):
//   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/test_050_channel_preset_pair_key_migration.cjs [db]
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

const tsSource = fs.readFileSync(path.join(__dirname, '../src/main/db/migrations/050_channel_preset_pair_key.ts'), 'utf8')
const mod = new Module('050_channel_preset_pair_key')
mod._compile(esbuild.transformSync(tsSource, { loader: 'ts', format: 'cjs' }).code, '050_channel_preset_pair_key.js')
const runMigration = mod.exports.run

const copyPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'migration-050-')), 'copy.sqlite')
const src = new Database(source, { readonly: true, fileMustExist: true })
src.exec(`VACUUM INTO '${copyPath.replace(/'/g, "''")}'`)
src.close()

const db = new Database(copyPath)
let failures = 0
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

const columns = () => db.pragma('table_info(channel_preset_items)').map((c) => c.name)
const rows = () => db.prepare('SELECT * FROM channel_preset_items ORDER BY id').all()
check('pair_key absent before', !columns().includes('pair_key'))
const before = rows()

db.pragma('foreign_keys = OFF')
db.transaction(() => {
  runMigration(db)
  const violations = db.pragma('foreign_key_check')
  if (violations.length > 0) throw new Error(`${violations.length} broken foreign key reference(s)`)
})()
db.pragma('foreign_keys = ON')

const col = db.pragma('table_info(channel_preset_items)').find((c) => c.name === 'pair_key')
check('pair_key is a nullable TEXT column', col?.type === 'TEXT' && col.notnull === 0, JSON.stringify(col))
const after = rows()
check('every existing row reads as unpaired', after.every((r) => r.pair_key === null), `${after.length} rows`)
check(
  'existing values unchanged',
  JSON.stringify(after.map(({ pair_key, ...rest }) => rest)) === JSON.stringify(before),
  `${before.length} rows`
)

// Round-trip a pair through the column.
const presetId = db.prepare("INSERT INTO channel_presets (name) VALUES ('050 test')").run().lastInsertRowid
const insert = db.prepare("INSERT INTO channel_preset_items (preset_id, sort_order, instrument_type, source_name, pair_key) VALUES (?, ?, 'Test', '', ?)")
insert.run(presetId, 0, 'abc')
insert.run(presetId, 1, 'abc')
insert.run(presetId, 2, null)
const keys = db.prepare('SELECT pair_key FROM channel_preset_items WHERE preset_id = ? ORDER BY sort_order').all(presetId).map((r) => r.pair_key)
check('pair keys round-trip', JSON.stringify(keys) === JSON.stringify(['abc', 'abc', null]), JSON.stringify(keys))
db.prepare('DELETE FROM channel_presets WHERE id = ?').run(presetId)
check('deleting the preset still cascades to its items', db.prepare('SELECT count(*) AS n FROM channel_preset_items WHERE preset_id = ?').get(presetId).n === 0)
check('no foreign key violations', db.pragma('foreign_key_check').length === 0)

db.close()
fs.rmSync(path.dirname(copyPath), { recursive: true, force: true })
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
