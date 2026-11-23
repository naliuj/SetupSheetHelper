import type Database from 'better-sqlite3'

/** Stereo mics take two channels, so each one counts as 2 in a mic locker. berkleeSeedData.json
 *  had the Royer SF-24 at 1 in Studios 2 and 3, and the Faculty Reserve's Neumann USM 69 and SM 23
 *  at 1; the JSON is corrected, but that only reaches fresh installs and the Faculty Reserve's
 *  reset, so this follows up on existing ones. (Studio 1's SF-24 and the reserve's AEA R88 were
 *  already 2.)
 *
 *  Same restraint as migration 040: scoped to Berklee's own rooms and the reserve, and guarded on
 *  the stale seeded value of 1, so a count someone has set themselves is kept. A no-op where
 *  Berklee data was never seeded, and on a fresh install that seeded 2.
 *
 *  052, not 051: 051 is taken by the unmerged feature/multi-band branch (051_bands). The runner
 *  applies any version it hasn't recorded, so the two land in either order. */
export function run(db: Database.Database): void {
  db.prepare(
    `UPDATE mics
        SET quantity = 2
      WHERE pool_type = 'studio'
        AND manufacturer = 'Royer'
        AND name = 'SF-24'
        AND quantity = 1
        AND studio_id IN (
          SELECT s.id FROM studios s
            JOIN buildings b ON b.id = s.building_id
           WHERE b.name = '160' AND s.name IN ('Studio 2', 'Studio 3')
        )`
  ).run()
  db.prepare(
    `UPDATE mics
        SET quantity = 2
      WHERE pool_type = 'faculty_reserve'
        AND manufacturer = 'Neumann'
        AND name IN ('USM 69', 'SM 23')
        AND quantity = 1`
  ).run()
}
