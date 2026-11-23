// Verifies migration 052 (stereo mics count as 2) on a COPY of a real database, running the REAL
// migration code (transpiled from TS via esbuild) inside one transaction, as migrate.ts does.
//
//   node scripts/test_052_stereo_mic_quantities_migration.cjs [db]
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

const tsSource = fs.readFileSync(path.join(__dirname, '../src/main/db/migrations/052_stereo_mic_quantities.ts'), 'utf8')
const mod = new Module('052_stereo_mic_quantities')
mod._compile(esbuild.transformSync(tsSource, { loader: 'ts', format: 'cjs' }).code, '052_stereo_mic_quantities.js')
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

const count = (pool, studio, name) =>
  db
    .prepare(
      `SELECT m.quantity FROM mics m LEFT JOIN studios s ON s.id = m.studio_id
        WHERE m.pool_type = ? AND m.name = ? AND (s.name IS ? OR ? IS NULL)`
    )
    .get(pool, name, studio, studio)?.quantity
const targets = [
  ['studio', 'Studio 2', 'SF-24'],
  ['studio', 'Studio 3', 'SF-24'],
  ['faculty_reserve', null, 'USM 69'],
  ['faculty_reserve', null, 'SM 23']
]
if (targets.some((t) => count(...t) === undefined)) {
  console.log('This database has no seeded Berklee mics to test against.')
  process.exit(1)
}

// A count someone set by hand must survive: pretend the SM 23 was edited to 3.
db.prepare("UPDATE mics SET quantity = 3 WHERE pool_type = 'faculty_reserve' AND name = 'SM 23'").run()
const untouchedBefore = db.prepare('SELECT id, quantity FROM mics ORDER BY id').all()

db.transaction(() => runMigration(db))()

for (const t of targets.slice(0, 3)) check(`${t[1] ?? 'Faculty Reserve'} ${t[2]} is 2`, count(...t) === 2)
check('a hand-set count is kept', count('faculty_reserve', null, 'SM 23') === 3)
check('Studio 1 SF-24 still 2', count('studio', 'Studio 1', 'SF-24') === 2)
check('Faculty Reserve R88 still 2', count('faculty_reserve', null, 'R88') === 2)
const changed = db
  .prepare('SELECT id, quantity FROM mics ORDER BY id')
  .all()
  .filter((r, i) => r.quantity !== untouchedBefore[i].quantity)
check('only the three stale rows changed', changed.length === 3, `${changed.length} changed`)

db.transaction(() => runMigration(db))()
check('a second run changes nothing', count('studio', 'Studio 2', 'SF-24') === 2)

db.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
