// Verifies migration 020 (folder scope split) against seeded scenarios, running the REAL migration
// code (transpiled from TS via esbuild). Run with: node scripts/test_020_folder_scope_migration.cjs
// Requires better-sqlite3 built for Node ABI (npm rebuild better-sqlite3 --build-from-source=false).
const Database = require('better-sqlite3')
const esbuild = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')

// Transpile + load the real migration's run(db).
const tsSource = fs.readFileSync(
  path.join(__dirname, '../src/main/db/migrations/020_folder_scope.ts'),
  'utf8'
)
const js = esbuild.transformSync(tsSource, { loader: 'ts', format: 'cjs' }).code
const mod = new Module('020_folder_scope')
mod._compile(js, '020_folder_scope.js')
const runMigration = mod.exports.run

// Pre-020 schema (subset): folders + the tables the migration reads.
function freshDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(parent_folder_id, name)
    );
    CREATE UNIQUE INDEX idx_folders_unique_root_name ON folders(name) WHERE parent_folder_id IS NULL;
    CREATE TABLE studios (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL);
    CREATE TABLE setups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, kind TEXT, folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL);
  `)
  return db
}

const mkFolder = (db, name, parent = null) =>
  Number(db.prepare('INSERT INTO folders (name, parent_folder_id) VALUES (?, ?)').run(name, parent).lastInsertRowid)
const mkStudio = (db, name, folderId) => db.prepare('INSERT INTO studios (name, folder_id) VALUES (?, ?)').run(name, folderId)
const mkSetup = (db, name, kind, folderId) =>
  db.prepare('INSERT INTO setups (name, kind, folder_id) VALUES (?, ?, ?)').run(name, kind, folderId)

let failures = 0
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) failures++
}
const scopeOf = (db, id) => db.prepare('SELECT scope FROM folders WHERE id = ?').get(id).scope
const folderByNameScope = (db, name, scope) =>
  db.prepare('SELECT * FROM folders WHERE name = ? AND scope = ? AND parent_folder_id IS NULL').get(name, scope)

const db = freshDb()

// 1. studio-only root
const fStudioOnly = mkFolder(db, 'StudioOnly')
mkStudio(db, 's1', fStudioOnly)
// 2. saved-setup-only root
const fSetupOnly = mkFolder(db, 'SetupOnly')
mkSetup(db, 'se1', 'setup', fSetupOnly)
// 3. template-only root (templates belong to the studio namespace)
const fTemplateOnly = mkFolder(db, 'TemplateOnly')
mkSetup(db, 't1', 'template', fTemplateOnly)
// 4. mixed root: studio + saved setup -> split
const fMixed = mkFolder(db, 'Mixed')
mkStudio(db, 's2', fMixed)
const se2 = mkSetup(db, 'se2', 'setup', fMixed).lastInsertRowid
// 5. nested mixed: studio in parent, saved setup in child -> split whole subtree
const fParent = mkFolder(db, 'Parent')
const fChild = mkFolder(db, 'Child', fParent)
mkStudio(db, 's3', fParent)
const se3 = mkSetup(db, 'se3', 'setup', fChild).lastInsertRowid
// 6. empty root -> default 'setup'
const fEmpty = mkFolder(db, 'Empty')

runMigration(db)

check('studio-only folder is scope=studio', scopeOf(db, fStudioOnly) === 'studio')
check('saved-setup-only folder is scope=setup', scopeOf(db, fSetupOnly) === 'setup')
check('template-only folder is scope=studio', scopeOf(db, fTemplateOnly) === 'studio')
check('empty folder defaults to scope=setup', scopeOf(db, fEmpty) === 'setup')

// Mixed root: original stays studio (holds the studio); a setup-scoped clone takes the saved setup.
check('mixed root original is scope=studio', scopeOf(db, fMixed) === 'studio')
const mixedClone = folderByNameScope(db, 'Mixed', 'setup')
check('mixed root has a setup-scoped clone', !!mixedClone)
check(
  'studio stays in the original mixed folder',
  db.prepare('SELECT folder_id FROM studios WHERE name = ?').get('s2').folder_id === fMixed
)
check(
  'saved setup se2 repointed to the setup clone',
  mixedClone && db.prepare('SELECT folder_id FROM setups WHERE id = ?').get(se2).folder_id === mixedClone.id
)

// Nested mixed: parent+child stay studio; clone tree (parent'+child') takes the saved setup, nesting preserved.
check('nested parent is scope=studio', scopeOf(db, fParent) === 'studio')
check('nested child is scope=studio', scopeOf(db, fChild) === 'studio')
const parentClone = folderByNameScope(db, 'Parent', 'setup')
check('nested parent has a setup clone', !!parentClone)
const childClone = parentClone
  ? db.prepare('SELECT * FROM folders WHERE name = ? AND scope = ? AND parent_folder_id = ?').get('Child', 'setup', parentClone.id)
  : null
check('cloned child nests under cloned parent', !!childClone)
check(
  'saved setup se3 repointed to the cloned child',
  childClone && db.prepare('SELECT folder_id FROM setups WHERE id = ?').get(se3).folder_id === childClone.id
)

// Root name+scope uniqueness now allows same-named folders across scopes (the split relied on it).
const rootDupIndex = db
  .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_folders_unique_root_name'")
  .get()
check('root unique index now includes scope', rootDupIndex && /scope/.test(rootDupIndex.sql))

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
