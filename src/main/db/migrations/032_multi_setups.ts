import type Database from 'better-sqlite3'

/** Groups N independent Setups ("bands") that share a studio and a day, so the editor can offer a
 *  tab strip to hop between them without detouring through Home. Deliberately not called "session"
 *  — Setup already owns session_date/session_notes.
 *
 *  One Multi Setup always belongs to exactly one studio (ON DELETE CASCADE — the studio's own
 *  cascade delete already removes every one of its setups first, so an emptied group cascading
 *  away afterward is correct, not destructive).
 *
 *  multi_setup_id on setups is ON DELETE SET NULL, not CASCADE: dissolving/unlinking a group must
 *  never delete the member setups — they're independent Setups first, grouped second. */
export function run(db: Database.Database): void {
  db.exec(`
    CREATE TABLE multi_setups (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      studio_id  INTEGER NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_multi_setups_studio ON multi_setups(studio_id);
  `)

  db.exec(
    'ALTER TABLE setups ADD COLUMN multi_setup_id INTEGER REFERENCES multi_setups(id) ON DELETE SET NULL'
  )
  db.exec('CREATE INDEX idx_setups_multi_setup ON setups(multi_setup_id)')
}
