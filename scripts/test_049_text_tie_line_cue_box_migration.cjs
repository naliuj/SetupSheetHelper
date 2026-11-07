// Verifies migration 049 (tie line / cue box columns become TEXT) on a COPY of a real database,
// running the REAL migration code (transpiled from TS via esbuild) the way migrate.ts runs it:
// foreign keys off, one transaction, then PRAGMA foreign_key_check.
//
// Run with Electron's Node, so better-sqlite3 keeps its Electron build (no rebuild dance):
//   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/test_049_text_tie_line_cue_box_migration.cjs [db]
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

const tsSource = fs.readFileSync(path.join(__dirname, '../src/main/db/migrations/049_text_tie_line_cue_box.ts'), 'utf8')
const mod = new Module('049_text_tie_line_cue_box')
mod._compile(esbuild.transformSync(tsSource, { loader: 'ts', format: 'cjs' }).code, '049_text_tie_line_cue_box.js')
const runMigration = mod.exports.run

const copyPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'migration-049-')), 'copy.sqlite')
const src = new Database(source, { readonly: true, fileMustExist: true })
src.exec(`VACUUM INTO '${copyPath.replace(/'/g, "''")}'`)
src.close()

const db = new Database(copyPath)
let failures = 0
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

const TABLES = ['setup_items', 'channel_preset_items']
const snapshot = (table) =>
  db.prepare(`SELECT * FROM ${table} ORDER BY id`).all().map((r) => ({
    ...r,
    tie_line: r.tie_line == null ? null : String(r.tie_line),
    cue_box: r.cue_box == null ? null : String(r.cue_box)
  }))
const seqOf = (table) => db.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(table)?.seq ?? null
const before = Object.fromEntries(TABLES.map((t) => [t, { rows: snapshot(t), seq: seqOf(t) }]))
const outboardsBefore = db.prepare('SELECT count(*) AS n FROM setup_item_outboards').get().n

db.pragma('foreign_keys = OFF')
db.transaction(() => {
  runMigration(db)
  const violations = db.pragma('foreign_key_check')
  if (violations.length > 0) throw new Error(`${violations.length} broken foreign key reference(s)`)
})()
db.pragma('foreign_keys = ON')

for (const table of TABLES) {
  const types = Object.fromEntries(db.pragma(`table_info(${table})`).map((c) => [c.name, c.type]))
  check(`${table}: tie_line and cue_box are TEXT`, types.tie_line === 'TEXT' && types.cue_box === 'TEXT', JSON.stringify([types.tie_line, types.cue_box]))
  check(`${table}: channel is still INTEGER`, types.channel === 'INTEGER')
  const after = snapshot(table)
  check(`${table}: same rows and values`, JSON.stringify(after) === JSON.stringify(before[table].rows), `${after.length} rows`)
  const nonText = db.prepare(`SELECT count(*) AS n FROM ${table} WHERE typeof(tie_line) NOT IN ('text','null') OR typeof(cue_box) NOT IN ('text','null')`).get().n
  check(`${table}: every stored value is text now`, nonText === 0, `${nonText} not text`)
  check(`${table}: AUTOINCREMENT mark kept`, seqOf(table) === before[table].seq, `${before[table].seq} -> ${seqOf(table)}`)
}

const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('setup_items','channel_preset_items')").all().map((r) => r.name)
check('indexes recreated', indexes.includes('idx_setupitems_setup') && indexes.includes('idx_channel_preset_items_preset'), indexes.join(', '))
check('setup_item_outboards untouched', db.prepare('SELECT count(*) AS n FROM setup_item_outboards').get().n === outboardsBefore)
check('no foreign key violations', db.pragma('foreign_key_check').length === 0)

// The point of the migration: numeric-looking text survives exactly.
const setupId = db.prepare('SELECT id FROM setups LIMIT 1').get()?.id
if (setupId != null) {
  const id = db.prepare("INSERT INTO setup_items (setup_id, instrument_type, tie_line, cue_box) VALUES (?, 'Test', '01', '1.50')").run(setupId).lastInsertRowid
  const row = db.prepare('SELECT tie_line, cue_box FROM setup_items WHERE id = ?').get(id)
  check('"01" and "1.50" round-trip exactly', row.tie_line === '01' && row.cue_box === '1.50', JSON.stringify(row))
  // Cascade still wired to the rebuilt table.
  db.prepare("INSERT INTO setup_item_outboards (setup_item_id, slot_index, outboard_text) VALUES (?, 0, 'x')").run(id)
  db.prepare('DELETE FROM setup_items WHERE id = ?').run(id)
  check('deleting a row still cascades to its outboards', db.prepare('SELECT count(*) AS n FROM setup_item_outboards WHERE setup_item_id = ?').get(id).n === 0)
}

db.close()
fs.rmSync(path.dirname(copyPath), { recursive: true, force: true })
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
