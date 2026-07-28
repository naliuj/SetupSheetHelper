import type Database from 'better-sqlite3'

/** Two additions that let a Multi Setup act like one thing rather than N loose setups.
 *
 *  `last_setup_id` — which member the group was last opened at, so Home's single grouped card drops
 *  you back into the band you were actually working in. Deliberately not derived from
 *  setups.updated_at: that tracks edits, and opening a band just to read it doesn't change it.
 *  ON DELETE SET NULL means deleting the remembered band silently falls back to the first member.
 *
 *  `multi_setup_source_links` — manually-declared "these names mean the same source" (e.g. one band
 *  calls it "Gtr 1", another "Guitar 1"), so the Compare view can treat them as one row. Keyed by
 *  NAME rather than setup_item id: it's a statement about names, not about particular rows, so it
 *  survives a row being deleted and retyped. The UNIQUE constraint keeps a name in at most one
 *  link group. */
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
