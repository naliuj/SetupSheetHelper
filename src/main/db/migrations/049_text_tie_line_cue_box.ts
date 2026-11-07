import type Database from 'better-sqlite3'

/** Tie line and cue box have been free text in the editor since labeled tie lines ("PB1") and
 *  stereo cues ("1-2") arrived, but their columns were still declared INTEGER. SQLite's INTEGER
 *  affinity rewrites any text that reads as a number on the way in, so a tie line typed as "01"
 *  came back as 1 and a cue box of "1.50" as 1.5 — the sheet and the PDF then showed something
 *  other than what was typed. Labels like "PB1" were never affected; numeric-looking ones were.
 *
 *  SQLite can't change a column's type in place, so both tables are rebuilt. Each new table is
 *  created from the CURRENT definition in sqlite_master with only those two column types
 *  swapped, rather than a hand-copied CREATE, so the columns earlier migrations ALTERed on
 *  (color, phantom_power, group_id, preamp_name…) carry over without being listed here. Copying
 *  into a TEXT column stores every existing number as its text ("12"). A value already rewritten
 *  ("01" stored as 1) can't be recovered; it simply stays "1". */
const TABLES: { name: string; indexes: string[] }[] = [
  { name: 'setup_items', indexes: ['CREATE INDEX idx_setupitems_setup ON setup_items(setup_id)'] },
  {
    name: 'channel_preset_items',
    indexes: ['CREATE INDEX idx_channel_preset_items_preset ON channel_preset_items(preset_id)']
  }
]

const TEXT_COLUMNS = /\b(tie_line|cue_box)(\s+)INTEGER\b/g

function rebuild(db: Database.Database, name: string, indexes: string[]): void {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as
    | { sql: string }
    | undefined
  if (!row) throw new Error(`Migration 49: table ${name} not found`)

  const header = new RegExp(`^CREATE TABLE\\s+"?${name}"?\\s*\\(`)
  if (!header.test(row.sql)) throw new Error(`Migration 49: unexpected definition for ${name}`)
  const createNew = row.sql.replace(header, `CREATE TABLE ${name}_new (`).replace(TEXT_COLUMNS, '$1$2TEXT')

  // AUTOINCREMENT's high-water mark. The copy only advances the new table's to the highest id
  // still present, so without this the ids of rows deleted from the end would be handed out again.
  const seq = db.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(name) as { seq: number } | undefined

  db.exec(createNew)
  // Same definition with the same column order, so a plain SELECT * lines up.
  db.exec(`INSERT INTO ${name}_new SELECT * FROM ${name}`)
  db.exec(`DROP TABLE ${name}`)
  db.exec(`ALTER TABLE ${name}_new RENAME TO ${name}`)
  for (const sql of indexes) db.exec(sql)
  if (seq) db.prepare('UPDATE sqlite_sequence SET seq = max(seq, ?) WHERE name = ?').run(seq.seq, name)
}

export function run(db: Database.Database): void {
  for (const { name, indexes } of TABLES) rebuild(db, name, indexes)
}
