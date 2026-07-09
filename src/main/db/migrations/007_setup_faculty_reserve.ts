import type Database from 'better-sqlite3'

/** Faculty reserve visibility moves from a per-studio opt-in to a per-setup one — students
 *  shouldn't see faculty reserve gear by default even in a real Berklee (building-bound)
 *  studio, so the old automatic "buildingId != null" grant is being replaced by this flag as
 *  the sole gate (see micsRepo.ts/outboardRepo.ts listAvailableForStudio). No live studio has
 *  the old flag set, so the column is dropped outright rather than backfilled. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE setups ADD COLUMN faculty_reserve_enabled INTEGER NOT NULL DEFAULT 0')
  db.exec('ALTER TABLE studios DROP COLUMN faculty_reserve_enabled')
}
