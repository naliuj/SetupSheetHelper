import type Database from 'better-sqlite3'

/** Per-setup export column overrides — the user's explicit per-column show/hide flips in the
 *  export dialogs' chip row, stored as a JSON object of SetupColumnKey → 'show' | 'hide'.
 *  Only DEVIATIONS from the computed default (visible in editor AND has data → on) are stored,
 *  so untouched columns keep tracking the sheet's data as it changes. Null = no overrides.
 *  Numbered 36: 32/33 belong to the parked feature/multi-setup branch, 34/35 are taken. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE setups ADD COLUMN export_column_overrides TEXT')
}
