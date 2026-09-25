import type Database from 'better-sqlite3'

/** Studio 2's Schoeps CMC6 Mk4 count went from 2 to 4 in berkleeSeedData.json. Migration 035
 *  reconciles already-seeded Berklee lockers against that file, but a migration only ever runs
 *  once and 035 has already run on existing installs, so on its own the corrected count would
 *  reach fresh installs only. This immutably follows up rather than editing 035.
 *
 *  Scoped to Berklee's own Studio 2 (building 160) rather than every CMC6 Mk4 in the database:
 *  Studio 1 legitimately stocks 4 already, Studio 3's is a separate "CMC6 MK4 Cardioid" entry, and
 *  a user's own studio is their catalogue, not ours. Guarded on the stale value of 2 so a room
 *  where someone has since set their own count keeps it — the same restraint migrations 027 and
 *  038 use, touching only rows that still hold the known seeded value.
 *
 *  Inherently a no-op where Berklee data was never seeded (the subquery matches no studio), and on
 *  a fresh install that already seeded 4 from the current JSON, in whichever order those run. */
export function run(db: Database.Database): void {
  db.prepare(
    `UPDATE mics
        SET quantity = 4
      WHERE pool_type = 'studio'
        AND manufacturer = 'Schoeps'
        AND name = 'CMC6 Mk4'
        AND quantity = 2
        AND studio_id = (
          SELECT s.id FROM studios s
            JOIN buildings b ON b.id = s.building_id
           WHERE b.name = '160' AND s.name = 'Studio 2'
        )`
  ).run()
}
