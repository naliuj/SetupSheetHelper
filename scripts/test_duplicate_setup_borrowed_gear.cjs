// Checks that duplicating a setup turns gear borrowed into the SOURCE setup's own pool
// (pool_type = 'setup') into text on the copy, so the names survive deleting the source, while
// links to ordinary studio gear stay links. Runs against a temp copy of the DEMO database only.
//
// Usage: node scripts/test_duplicate_setup_borrowed_gear.cjs [path/to/demo.sqlite]
// Uses node:sqlite (Node 22.5+) rather than better-sqlite3, which is built for Electron's ABI.
//
// The UPDATE statements below must match copyItemsToSetup in src/main/db/repositories/setupItemsRepo.ts.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { DatabaseSync } = require('node:sqlite')
const { APP_NAME, DB_FILE, resolveDbPath } = require('./lib/appDbPath.cjs')

const demoPath = path.join(os.homedir(), 'Library', 'Application Support', `${APP_NAME} (Demo)`, DB_FILE)
const sourcePath = resolveDbPath(process.argv[2] || demoPath)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dup-borrowed-gear-'))
const dbPath = path.join(dir, DB_FILE)
fs.copyFileSync(sourcePath, dbPath)

try {
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  const one = (sql, ...args) => db.prepare(sql).get(...args)
  const insert = (sql, ...args) => Number(db.prepare(sql).run(...args).lastInsertRowid)

  const studioId = one('SELECT id FROM studios ORDER BY id LIMIT 1').id
  const newSetup = (name) => insert(`INSERT INTO setups (studio_id, name) VALUES (?, ?)`, studioId, name)
  const source = newSetup('Borrowed gear source')
  const target = newSetup('Borrowed gear copy')

  const mic = insert(`INSERT INTO mics (pool_type, setup_id, name) VALUES ('setup', ?, 'Borrowed U47')`, source)
  const preamp = insert(`INSERT INTO preamps (pool_type, setup_id, name) VALUES ('setup', ?, 'Borrowed 1073')`, source)
  const outboard = insert(`INSERT INTO outboard_gear (pool_type, setup_id, name) VALUES ('setup', ?, 'Borrowed LA-2A')`, source)
  const studioMic = insert(`INSERT INTO mics (pool_type, studio_id, name) VALUES ('studio', ?, 'Studio SM57')`, studioId)

  const sourceItem = insert(
    `INSERT INTO setup_items (setup_id, instrument_type, source_name, mic_id, preamp_id) VALUES (?, 'custom_source', 'Vox', ?, ?)`,
    source, mic, preamp
  )
  const studioItem = insert(
    `INSERT INTO setup_items (setup_id, instrument_type, source_name, mic_id) VALUES (?, 'custom_source', 'Snare', ?)`,
    source, studioMic
  )
  insert(`INSERT INTO setup_item_outboards (setup_item_id, slot_index, outboard_id) VALUES (?, 0, ?)`, sourceItem, outboard)

  // What copyItemsToSetup inserts: the ids unchanged.
  const copyItem = (id) => {
    const newId = insert(
      `INSERT INTO setup_items (setup_id, instrument_type, source_name, mic_id, mic_text, preamp_id, preamp_text)
       SELECT ?, instrument_type, source_name, mic_id, mic_text, preamp_id, preamp_text FROM setup_items WHERE id = ?`,
      target, id
    )
    db.prepare(
      `INSERT INTO setup_item_outboards (setup_item_id, slot_index, outboard_id, outboard_text)
       SELECT ?, slot_index, outboard_id, outboard_text FROM setup_item_outboards WHERE setup_item_id = ?`
    ).run(newId, id)
    return newId
  }
  const copiedItem = copyItem(sourceItem)
  const copiedStudioItem = copyItem(studioItem)

  // The fix, as in copyItemsToSetup.
  const params = { sourceSetupId: source, targetSetupId: target }
  for (const [table, col] of [['mics', 'mic'], ['preamps', 'preamp']]) {
    db.prepare(
      `UPDATE setup_items
          SET ${col}_text = COALESCE(${col}_text, (SELECT name FROM ${table} WHERE id = ${col}_id)), ${col}_id = NULL
        WHERE setup_id = @targetSetupId
          AND ${col}_id IN (SELECT id FROM ${table} WHERE pool_type = 'setup' AND setup_id = @sourceSetupId)`
    ).run(params)
  }
  db.prepare(
    `UPDATE setup_item_outboards
        SET outboard_text = COALESCE(outboard_text, (SELECT name FROM outboard_gear WHERE id = outboard_id)), outboard_id = NULL
      WHERE setup_item_id IN (SELECT id FROM setup_items WHERE setup_id = @targetSetupId)
        AND outboard_id IN (SELECT id FROM outboard_gear WHERE pool_type = 'setup' AND setup_id = @sourceSetupId)`
  ).run(params)

  // Deleting the source cascades its pool gear away; the copy must not care.
  db.prepare('DELETE FROM setups WHERE id = ?').run(source)

  const item = one('SELECT * FROM setup_items WHERE id = ?', copiedItem)
  assert.equal(item.mic_id, null)
  assert.equal(item.mic_text, 'Borrowed U47')
  assert.equal(item.preamp_id, null)
  assert.equal(item.preamp_text, 'Borrowed 1073')
  const slot = one('SELECT * FROM setup_item_outboards WHERE setup_item_id = ?', copiedItem)
  assert.equal(slot.outboard_id, null)
  assert.equal(slot.outboard_text, 'Borrowed LA-2A')
  const kept = one('SELECT * FROM setup_items WHERE id = ?', copiedStudioItem)
  assert.equal(kept.mic_id, studioMic, 'studio gear stays linked')
  assert.equal(kept.mic_text, null)

  db.close()
  console.log('OK: borrowed mic, preamp and outboard names survive on the duplicate; studio gear stays linked.')
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}
