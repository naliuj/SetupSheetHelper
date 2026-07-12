// One-off fix: verifying the multi-row delete/undo toast (3am-student UX audit) mutated
// the "studio 2 test setup" fixture — "room l"/"room r" got re-added as plain rows
// without their original mic (Coles 4038) and channel (7/8) assignments. Restores them.
const Database = require('better-sqlite3')
const path = require('node:path')
const os = require('node:os')

const dbPath = path.join(
  os.homedir(),
  'Library/Application Support/Setup Sheet Helper/setup-sheet-helper.sqlite'
)
const db = new Database(dbPath)

const mic = db
  .prepare("select id from mics where name = '4038' and studio_id = 6")
  .get()
if (!mic) throw new Error('Coles 4038 mic not found in studio 6 pool')

const update = db.prepare(
  'update setup_items set mic_id = ?, channel = ? where setup_id = 1 and source_name = ?'
)

const applyFix = db.transaction(() => {
  update.run(mic.id, 7, 'room l')
  update.run(mic.id, 8, 'room r')
})
applyFix()

console.log(
  db
    .prepare(
      "select id, source_name, mic_id, channel from setup_items where setup_id = 1 and source_name in ('room l', 'room r')"
    )
    .all()
)
