import type Database from 'better-sqlite3'

/** Studio 1 has two channels each of Neve 1073 and Neve 1084, and Studio 3's Neve 1084 is two
 *  channels, not one. berkleeSeedData.json is corrected, but that only reaches fresh installs, so
 *  this follows up on existing ones.
 *
 *  Same restraint as migration 052: scoped to Berklee's own rooms (building 160), the Studio 3
 *  update is guarded on the stale seeded value of 1 so a count someone set themselves is kept,
 *  and Studio 1 only gains a preamp it doesn't already list under that name. A no-op where
 *  Berklee data was never seeded. */
export function run(db: Database.Database): void {
  const studioId = (name: string): number | undefined =>
    (
      db
        .prepare(
          `SELECT s.id FROM studios s JOIN buildings b ON b.id = s.building_id
            WHERE b.name = '160' AND s.name = ?`
        )
        .get(name) as { id: number } | undefined
    )?.id

  const studio1 = studioId('Studio 1')
  if (studio1 != null) {
    const has = db.prepare(
      `SELECT 1 FROM preamps WHERE pool_type = 'studio' AND studio_id = ? AND lower(trim(name)) = lower(?)`
    )
    const insert = db.prepare(
      `INSERT INTO preamps (pool_type, studio_id, name, manufacturer, category, notes, channels, sort_order)
       VALUES ('studio', ?, ?, 'Neve', NULL, NULL, 2, 0)`
    )
    for (const name of ['Neve 1073', 'Neve 1084']) {
      if (!has.get(studio1, name)) insert.run(studio1, name)
    }
  }

  const studio3 = studioId('Studio 3')
  if (studio3 != null) {
    db.prepare(
      `UPDATE preamps SET channels = 2
        WHERE pool_type = 'studio' AND studio_id = ? AND name = 'Neve 1084' AND channels = 1`
    ).run(studio3)
  }
}
