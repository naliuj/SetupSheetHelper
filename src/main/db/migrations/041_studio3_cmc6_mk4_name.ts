import type Database from 'better-sqlite3'

/** Studio 3 listed its Schoeps as "CMC6 MK4 Cardioid" while Studios 1 and 2 list the same mic as
 *  "CMC6 Mk4", so it sorted and grouped apart from them in every list that spans studios. The seed
 *  JSON now says "CMC6 Mk4" everywhere; this is the path to installs that were already seeded,
 *  since migration 035 reconciles lockers against that file but has already run.
 *
 *  Same mic, not a different one: on a Schoeps modular body the MK4 IS the cardioid capsule, so
 *  the trailing "Cardioid" restated the capsule rather than naming a separate product. That is the
 *  bar migration 038 set for touching a name at all — provable same model, never a blanket
 *  re-spelling of near-identical names.
 *
 *  Renames in place rather than deleting and re-inserting, so the row keeps its id and
 *  `setup_items.mic_id` on saved sheets keeps resolving. Skips if that studio somehow already has
 *  a "CMC6 Mk4" (a user could have added one by hand): `UNIQUE(studio_id, name)` would otherwise
 *  throw, and a migration that throws takes the app's ability to open the database with it.
 *
 *  A no-op where Berklee data was never seeded, and on a fresh install already seeded from the
 *  current JSON. */
export function run(db: Database.Database): void {
  db.prepare(
    `UPDATE mics
        SET name = 'CMC6 Mk4'
      WHERE pool_type = 'studio'
        AND manufacturer = 'Schoeps'
        AND name = 'CMC6 MK4 Cardioid'
        AND studio_id = (
          SELECT s.id FROM studios s
            JOIN buildings b ON b.id = s.building_id
           WHERE b.name = '160' AND s.name = 'Studio 3'
        )
        AND NOT EXISTS (
          SELECT 1 FROM mics existing
           WHERE existing.pool_type = 'studio'
             AND existing.studio_id = mics.studio_id
             AND existing.name = 'CMC6 Mk4'
        )`
  ).run()
}
