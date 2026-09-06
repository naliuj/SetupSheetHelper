import type Database from 'better-sqlite3'
import seedData from './berkleeSeedData.json'

/** Gives already-seeded Berklee studios the preamp lockers they never had.
 *
 *  Berklee shipped with NO preamps at all — berkleeSeedData.json had no `preamps` key, so every
 *  studio's preamp list was empty and its actual preamps sat in the outboard list. That left the
 *  Preamp column on a Berklee sheet with nothing to offer. The seed JSON now carries preamps, but
 *  seedBerklee.ts bails out once `buildings` has rows, so regenerating it only ever reaches FRESH
 *  installs — this migration is the path for anyone who already opted in.
 *
 *  Two kinds of entry, see PREAMP_SPLIT below:
 *    - `keepOutboard: false` — a pure mic preamp. Moves: the preamp row is inserted and the
 *      outboard row is deleted.
 *    - `keepOutboard: true` — a channel strip that is genuinely a preamp AND a compressor (the
 *      6176 is a 610 preamp plus an 1176; the STT-1 Origin is a preamp plus EQ plus a compressor).
 *      Copies: it stays in the outboard list too, so it can still be patched purely as a
 *      compressor. The two entries share ONE capacity pool — see state/exportColumns-adjacent
 *      pooling in renderer/src/state/usageCounts.ts, which pools usage across the two catalogs by
 *      manufacturer+name rather than needing a link column here.
 *
 *  `channels` is total channels, derived from the LIVE quantity rather than hardcoded, so a user
 *  who edited the count keeps their own number: quantity x channelsPerUnit. Every unit here is
 *  single-channel except the TRUE Systems Precision8, which is an 8-channel preamp (2 units -> 16).
 *
 *  Deliberately targeted, NOT a full reconcile like 035: it touches only these seven models and
 *  leaves every other outboard row alone, including gear the user added to a Berklee studio
 *  themselves. Matching is on manufacturer+name (lowercased/trimmed), never on row ids, so it is
 *  idempotent, safe to re-run, and a no-op on a fresh install or where the user already removed
 *  the gear. Scope is `pool_type = 'studio'` only — building, faculty-reserve, personal and
 *  per-setup pools are untouched. */

interface PreampSplitEntry {
  manufacturer: string
  name: string
  /** Channels on ONE unit. Multiplied by the live outboard quantity to get total channels. */
  channelsPerUnit: number
  /** True for channel strips that stay in the outboard list as well. */
  keepOutboard: boolean
}

const PREAMP_SPLIT: PreampSplitEntry[] = [
  { manufacturer: 'Neve', name: 'Neve 1073', channelsPerUnit: 1, keepOutboard: false },
  { manufacturer: 'Neve', name: 'Neve 1084', channelsPerUnit: 1, keepOutboard: false },
  { manufacturer: 'API', name: 'API 512c', channelsPerUnit: 1, keepOutboard: false },
  { manufacturer: 'GML', name: 'GML 2020', channelsPerUnit: 1, keepOutboard: false },
  { manufacturer: 'True Systems', name: 'TRUE Systems Precision8', channelsPerUnit: 8, keepOutboard: false },
  { manufacturer: 'Universal Audio', name: 'Universal Audio 6176', channelsPerUnit: 1, keepOutboard: true },
  { manufacturer: 'Millennia Media', name: 'Millennia Media STT-1', channelsPerUnit: 1, keepOutboard: true }
]

export function run(db: Database.Database): void {
  const seeded = db.prepare('SELECT COUNT(*) AS c FROM buildings').get() as { c: number }
  if (seeded.c === 0) return

  const studioRow = db.prepare(
    `SELECT s.id AS id FROM studios s
       JOIN buildings b ON b.id = s.building_id
      WHERE b.name = ? AND s.name = ?`
  )
  const liveOutboard = db.prepare(
    `SELECT id, name, manufacturer, category, notes, quantity, sort_order
       FROM outboard_gear WHERE pool_type = 'studio' AND studio_id = ?`
  )
  const livePreamps = db.prepare(
    `SELECT id, name, manufacturer FROM preamps WHERE pool_type = 'studio' AND studio_id = ?`
  )
  const insertPreamp = db.prepare(
    `INSERT INTO preamps (pool_type, studio_id, name, manufacturer, category, notes, channels, sort_order)
     VALUES ('studio', ?, ?, ?, ?, ?, ?, ?)`
  )
  // Mirrors removeOutboard in outboardRepo.ts: a slot still pointing at the row keeps the gear's
  // name as free text instead of going blank, and never clobbers text the user typed themselves.
  const preserveName = db.prepare(
    `UPDATE setup_item_outboards
        SET outboard_text = (SELECT name FROM outboard_gear WHERE id = ?)
      WHERE outboard_id = ? AND outboard_text IS NULL`
  )
  const deleteOutboard = db.prepare('DELETE FROM outboard_gear WHERE id = ?')

  const key = (manufacturer: string | null, name: string): string =>
    `${(manufacturer ?? '').trim().toLowerCase()}|${name.trim().toLowerCase()}`

  const splitByKey = new Map(PREAMP_SPLIT.map((e) => [key(e.manufacturer, e.name), e]))

  db.transaction(() => {
    for (const s of seedData.studios) {
      const studio = studioRow.get(s.buildingName, s.name) as { id: number } | undefined
      // A studio the user renamed or deleted is left alone rather than guessed at.
      if (!studio) continue

      const preampKeys = new Set(
        (livePreamps.all(studio.id) as { name: string; manufacturer: string | null }[]).map((p) =>
          key(p.manufacturer, p.name)
        )
      )

      const outboard = liveOutboard.all(studio.id) as {
        id: number
        name: string
        manufacturer: string | null
        category: string | null
        notes: string | null
        quantity: number
        sort_order: number
      }[]

      for (const row of outboard) {
        const entry = splitByKey.get(key(row.manufacturer, row.name))
        if (!entry) continue

        if (!preampKeys.has(key(row.manufacturer, row.name))) {
          insertPreamp.run(
            studio.id,
            row.name,
            row.manufacturer,
            row.category,
            row.notes,
            Math.max(1, row.quantity * entry.channelsPerUnit),
            row.sort_order
          )
        }

        if (!entry.keepOutboard) {
          preserveName.run(row.id, row.id)
          deleteOutboard.run(row.id)
        }
      }
    }
  })()
}
