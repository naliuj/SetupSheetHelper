import type Database from 'better-sqlite3'
import seedData from './berkleeSeedData.json'

/** Brings already-seeded Berklee studios' mic lockers back in line with berkleeSeedData.json.
 *
 *  Why this is needed at all: Berklee data is seeded on demand by seedBerklee.ts, which bails out
 *  early once `buildings` has any rows. So regenerating berkleeSeedData.json only ever reaches
 *  FRESH installs — anyone who had already opted in keeps whatever list they were seeded with,
 *  with no path to the corrected one. This migration is that path.
 *
 *  Reconciles rather than delete-and-reinsert, which matters: wiping a studio's mics and
 *  re-inserting them would hand every row a new id and blank out `setup_items.mic_id` on every
 *  saved setup in that studio, including mics whose entry didn't actually change. Instead:
 *    - present in both (matched on manufacturer+name) → keep the existing row, refresh its
 *      quantity/category/notes/sort_order. The id survives, so setups keep pointing at it.
 *    - in the seed only → insert.
 *    - in the studio only → copy its name into `mic_text` on any setup row still referencing it
 *      (only where that's still null, so a user's own free text is never clobbered) before
 *      deleting, mirroring removeMic in micsRepo.ts. Without this, deleting a renamed mic would
 *      silently blank those rows — the exact bug removeMic was written to prevent.
 *
 *  Scope is deliberately narrow: only `pool_type = 'studio'` mics, only for studios that exist in
 *  the seed. Building-pool, faculty-reserve, personal, and per-setup mics are untouched, as is
 *  outboard gear, and so is any user-created (buildingless) studio. If Berklee data was never
 *  seeded here, there's nothing to reconcile and this is a no-op. */
export function run(db: Database.Database): void {
  const seeded = db.prepare('SELECT COUNT(*) AS c FROM buildings').get() as { c: number }
  if (seeded.c === 0) return

  const studioRow = db.prepare(
    `SELECT s.id AS id FROM studios s
       JOIN buildings b ON b.id = s.building_id
      WHERE b.name = ? AND s.name = ?`
  )
  const liveMics = db.prepare(
    `SELECT id, name, manufacturer FROM mics WHERE pool_type = 'studio' AND studio_id = ?`
  )
  const updateMic = db.prepare(
    `UPDATE mics SET category = ?, notes = ?, quantity = ?, sort_order = ? WHERE id = ?`
  )
  const insertMic = db.prepare(
    `INSERT INTO mics (pool_type, studio_id, name, manufacturer, category, notes, quantity, sort_order)
     VALUES ('studio', ?, ?, ?, ?, ?, ?, ?)`
  )
  const preserveName = db.prepare(
    `UPDATE setup_items
        SET mic_text = (SELECT name FROM mics WHERE id = ?)
      WHERE mic_id = ? AND mic_text IS NULL`
  )
  const deleteMic = db.prepare('DELETE FROM mics WHERE id = ?')

  // manufacturer+name is the identity here — a mic re-attributed to a different manufacturer
  // (e.g. "DPA 4011" becoming "B&K 4011") is deliberately treated as a remove plus an add, not an
  // edit, since there's no reliable way to tell that apart from two genuinely different mics.
  const key = (manufacturer: string | null, name: string): string =>
    `${(manufacturer ?? '').trim().toLowerCase()}|${name.trim().toLowerCase()}`

  const seedByStudio = new Map<string, typeof seedData.mics>()
  for (const m of seedData.mics) {
    if (m.poolType !== 'studio' || !m.buildingName || !m.studioName) continue
    const k = `${m.buildingName}::${m.studioName}`
    const list = seedByStudio.get(k) ?? []
    list.push(m)
    seedByStudio.set(k, list)
  }

  db.transaction(() => {
    for (const [studioKey, seedMics] of seedByStudio) {
      const [buildingName, studioName] = studioKey.split('::')
      const studio = studioRow.get(buildingName, studioName) as { id: number } | undefined
      // A studio the user renamed or deleted simply isn't reconciled — better to leave it alone
      // than to guess which local studio a seed entry was meant to be.
      if (!studio) continue

      const live = liveMics.all(studio.id) as { id: number; name: string; manufacturer: string | null }[]
      const liveByKey = new Map(live.map((m) => [key(m.manufacturer, m.name), m]))
      const seedKeys = new Set(seedMics.map((m) => key(m.manufacturer, m.name)))

      for (const m of seedMics) {
        const existing = liveByKey.get(key(m.manufacturer, m.name))
        if (existing) {
          updateMic.run(m.category, m.notes, m.quantity, m.sortOrder, existing.id)
        } else {
          insertMic.run(studio.id, m.name, m.manufacturer, m.category, m.notes, m.quantity, m.sortOrder)
        }
      }

      for (const m of live) {
        if (seedKeys.has(key(m.manufacturer, m.name))) continue
        preserveName.run(m.id, m.id)
        deleteMic.run(m.id)
      }
    }
  })()
}
