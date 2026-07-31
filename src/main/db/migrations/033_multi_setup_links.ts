import type Database from 'better-sqlite3'

/** Two additions that let a Multi Setup act like one thing rather than N loose setups.
 *
 *  `last_setup_id` — which member the group was last opened at, so Home's single grouped card drops
 *  you back into the band you were actually working in. Deliberately not derived from
 *  setups.updated_at: that tracks edits, and opening a band just to read it doesn't change it.
 *  ON DELETE SET NULL means deleting the remembered band silently falls back to the first member.
 *
 *  `multi_setup_source_links` — CURRENTLY UNUSED. It backed a "these names mean the same source"
 *  declaration for Compare's old by-source pivot, where rows were keyed on the source name and a
 *  band renaming its source would otherwise split into two half-empty rows. Compare is now keyed on
 *  the channel, which makes a rename one row with two labels and leaves nothing for a link to fix.
 *  The table is left in place rather than dropped by a follow-up migration — it holds no data any
 *  code reads, and keeping it costs nothing if the idea comes back. */
export function run(db: Database.Database): void {
  db.exec(
    'ALTER TABLE multi_setups ADD COLUMN last_setup_id INTEGER REFERENCES setups(id) ON DELETE SET NULL'
  )

  db.exec(`
    CREATE TABLE multi_setup_source_links (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      multi_setup_id INTEGER NOT NULL REFERENCES multi_setups(id) ON DELETE CASCADE,
      link_key       TEXT NOT NULL,
      source_name    TEXT NOT NULL,
      UNIQUE(multi_setup_id, source_name)
    );
    CREATE INDEX idx_multi_setup_source_links_group ON multi_setup_source_links(multi_setup_id, link_key);
  `)
}
