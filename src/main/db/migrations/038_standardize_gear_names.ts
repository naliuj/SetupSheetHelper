import type Database from 'better-sqlite3'
import seedData from './berkleeSeedData.json'

/** Standardizes gear spellings in already-seeded Berklee lockers to match the manufacturers'.
 *
 *  The seeded catalogue had the same box entered two ways in different rooms — "KSM-27" beside
 *  "KSM27", "U87 AI" beside "U87 Ai" — which reads as a duplicate in any list that spans studios
 *  (the Quick Setup suggestions, the "add from catalogue" pickers), plus a handful of manufacturer
 *  typos: "Lexion" for Lexicon, "Summit" for Summit Audio, "Bricasti" for Bricasti Design.
 *
 *  Renaming rather than merging: each row keeps its id, so `setup_items.mic_id` and
 *  `setup_item_outboards.outboard_id` on every saved sheet keep resolving. Nothing is deleted.
 *
 *  Deliberately NOT a general de-hyphenation. The catalogue is also inconsistent about SM-57 vs
 *  SM57 and AT-4050 vs AT4050, but near-identical names there are frequently DIFFERENT products —
 *  Neumann's U 87 and U87 Ai are different generations, AKG's C451/C451 EB/C451B are different
 *  variants — so a blanket rule would quietly conflate real gear. Only provable same-model pairs
 *  and manufacturer names are touched here.
 *
 *  Scope is Berklee's own seeded gear: the per-studio lockers (matched by building+studio name
 *  like migration 037), the building-office pools, and faculty reserve. All three matter — every
 *  one of the mic variants ("KSM-27", "U87 AI", "AT-M87R") is a BUILDING-pool row, so a
 *  studio-only pass would have missed the entire mic half of this. A user who typed "Lexion" into
 *  their own custom studio keeps it: that's their catalogue, not ours. */

/** Manufacturer field, by exact current value. */
const MANUFACTURERS: Record<string, string> = {
  Lexion: 'Lexicon',
  Tech21: 'Tech 21',
  Summit: 'Summit Audio',
  Chandler: 'Chandler Limited',
  'Crowley & Trip': 'Crowley and Tripp',
  Bricasti: 'Bricasti Design'
}

/** Gear name, by exact current value. Outboard names embed the manufacturer, so a brand fix above
 *  usually needs its partner here. The three Tech 21 entries collapse onto one model: the bare
 *  "Sansamp" rows are the same PSA-1 the other rooms list in full. */
const NAMES: Record<string, string> = {
  'Lexion PCM-42': 'Lexicon PCM-42',
  'Summit EQP-200A': 'Summit Audio EQP-200A',
  'Summit TLA-100A': 'Summit Audio TLA-100A',
  'Summit TLA-50': 'Summit Audio TLA-50',
  // "Zener Limited" is a typo for Chandler's Zener Limiter. Both the original spelling and the
  // half-corrected one are listed, so a database that already ran an earlier build of this
  // migration still lands on the right name.
  'Chandler Zener Limited': 'Chandler Limited Zener Limiter',
  'Chandler Limited Zener Limited': 'Chandler Limited Zener Limiter',
  'Bricasti M7 Reverb': 'Bricasti Design M7 Reverb',
  'Bricasti M7 Reverb with remote': 'Bricasti Design M7 Reverb with remote',
  'Tech21 SansAmp PSA-1': 'Tech 21 SansAmp PSA-1',
  'Tech 21 Sansamp': 'Tech 21 SansAmp PSA-1',
  'Tech21 Sansamp': 'Tech 21 SansAmp PSA-1',
  'TC Electronics M3000': 'TC Electronic M3000',
  'TC Electronics M-One': 'TC Electronic M-One',
  // Studio A's lone "0131 FET" against five rooms' "013 FET" — Soyuz makes the 013, not an 0131,
  // so this is a stray keystroke rather than a different mic, and it kept Studio A's copy from
  // grouping with the others anywhere in the app.
  '0131 FET': '013 FET',
  'KSM-27': 'KSM27',
  'U87 AI': 'U87 Ai',
  'AT-M87R': 'ATM-87R'
}

const TABLES = ['mics', 'outboard_gear', 'preamps'] as const

export function run(db: Database.Database): void {
  const seeded = db.prepare('SELECT COUNT(*) AS c FROM buildings').get() as { c: number }
  if (seeded.c === 0) return

  const studioRow = db.prepare(
    `SELECT s.id AS id FROM studios s
       JOIN buildings b ON b.id = s.building_id
      WHERE b.name = ? AND s.name = ?`
  )
  const buildingRow = db.prepare('SELECT id FROM buildings WHERE name = ?')

  /** Renames one pool's worth of rows. `where`/`params` pick the pool out of each gear table. */
  const renamePool = (where: string, params: (number | string)[]): void => {
    for (const table of TABLES) {
      const rows = db
        .prepare(`SELECT id, name, manufacturer FROM ${table} WHERE ${where}`)
        .all(...params) as { id: number; name: string; manufacturer: string | null }[]
      const takenNames = new Set(rows.map((r) => r.name))
      const update = db.prepare(`UPDATE ${table} SET name = ?, manufacturer = ? WHERE id = ?`)

      for (const row of rows) {
        const nextName = NAMES[row.name] ?? row.name
        const nextManufacturer = row.manufacturer != null ? MANUFACTURERS[row.manufacturer] ?? row.manufacturer : null
        if (nextName === row.name && nextManufacturer === row.manufacturer) continue
        // `UNIQUE(studio_id, name)` — if the corrected spelling is somehow already in this pool (a
        // user added it by hand), skip rather than abort the whole migration and, with it, the
        // app's ability to open the database at all.
        if (nextName !== row.name && takenNames.has(nextName)) continue

        update.run(nextName, nextManufacturer, row.id)
        takenNames.delete(row.name)
        takenNames.add(nextName)
      }
    }
  }

  db.transaction(() => {
    for (const studio of seedData.studios) {
      const found = studioRow.get(studio.buildingName, studio.name) as { id: number } | undefined
      // Renamed or deleted by the user — leave it alone rather than guess which room it was.
      if (!found) continue
      renamePool(`pool_type = 'studio' AND studio_id = ?`, [found.id])
    }
    for (const building of seedData.buildings) {
      const found = buildingRow.get(building.name) as { id: number } | undefined
      if (!found) continue
      renamePool(`pool_type = 'building' AND building_id = ?`, [found.id])
    }
    // One global pool, no owner column to scope by. Only exact matches of the seeded spellings are
    // touched, so anything the user added themselves is untouched.
    renamePool(`pool_type = 'faculty_reserve'`, [])
  })()
}
