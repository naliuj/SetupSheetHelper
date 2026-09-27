import type Database from 'better-sqlite3'
import seedData from './berkleeSeedData.json'
import {
  BERKLEE_MIC_MANUFACTURER_RENAMES,
  BERKLEE_MIC_RENAMES,
  canonicalMicManufacturer
} from '@shared/constants/berkleeMicRenames'

/** Brings already-seeded Berklee mic lockers onto the spellings from the 2026-09 naming audit.
 *
 *  Studio 3's "CMC6 MK4 Cardioid" beside everyone else's "CMC6 Mk4" (migration 041) turned out not
 *  to be alone. The audit found the same mic entered with a word tacked on in one room ("VMA Tube
 *  Microphone", "JDI Passive DI Box", "U5 DI"), model families spelled two ways by the same
 *  manufacturer ("AT-4050" beside "AT4041", "KSM-32" beside "KSM27", "KM184" beside "KM 84"), and
 *  two office entries that aren't real products. Each split sorted and grouped apart in every list
 *  that spans studios. The full map, with reasons, is berkleeMicRenames.ts; the seed JSON already
 *  carries the new spellings for fresh installs.
 *
 *  Same rules as 038 and 041: rename by id, so `setup_items.mic_id` on every saved sheet keeps
 *  resolving; nothing is deleted; and only Berklee's own seeded gear is touched — the rooms found by
 *  building+studio name, the building-office pools, and faculty reserve. A user's custom studio
 *  keeps whatever spelling they gave it, and presets or setup files that name the old spelling
 *  still match, through canonicalMicKey, rather than being rewritten here.
 *
 *  The pool guard is case-insensitive: if a room somehow already has the target name (a user added
 *  it by hand), the rename is skipped rather than leaving two rows that every name matcher, which
 *  ignores case, would treat as one mic. `mics` has no UNIQUE constraint, so this guard is about
 *  duplicates, not about a statement throwing.
 *
 *  Then it re-links orphaned sheet rows. An install still older than v1.13.1 runs migration 035 in
 *  the same upgrade, against the NEW seed file: 035 matches mics by name, so it sees "VMA Tube
 *  Microphone" as a mic Berklee no longer stocks, copies the name into `mic_text` on every sheet
 *  using it, deletes the row, and inserts "VMA Tube" fresh. Those sheets end up showing the old
 *  name as unlinked text. Any sheet row in a Berklee room whose `mic_text` is a RETIRED spelling of
 *  a mic that room now has is linked back to it. Retired spellings only, so free text a user typed
 *  to match a current name is left as their text. 041's rename had the same exposure and is
 *  covered too, since its pair is in the map. */
export function run(db: Database.Database): void {
  const seeded = db.prepare('SELECT COUNT(*) AS c FROM buildings').get() as { c: number }
  if (seeded.c === 0) return

  const studioRow = db.prepare(
    `SELECT s.id AS id FROM studios s
       JOIN buildings b ON b.id = s.building_id
      WHERE b.name = ? AND s.name = ?`
  )
  const buildingRow = db.prepare('SELECT id FROM buildings WHERE name = ?')
  const update = db.prepare('UPDATE mics SET name = ?, manufacturer = ? WHERE id = ?')

  type MicRow = { id: number; name: string; manufacturer: string | null }

  /** Renames one pool's worth of mics. `where`/`params` pick the pool out of the table. */
  const renamePool = (where: string, params: (number | string)[]): void => {
    const rows = db.prepare(`SELECT id, name, manufacturer FROM mics WHERE ${where}`).all(...params) as MicRow[]
    const takenNames = new Set(rows.map((r) => r.name.trim().toLowerCase()))

    for (const row of rows) {
      const nextManufacturer =
        row.manufacturer != null ? (BERKLEE_MIC_MANUFACTURER_RENAMES[row.manufacturer] ?? row.manufacturer) : null
      const rename = BERKLEE_MIC_RENAMES.find((r) => r.manufacturer === nextManufacturer && r.from === row.name)
      const nextName = rename?.to ?? row.name
      if (nextName === row.name && nextManufacturer === row.manufacturer) continue
      if (nextName !== row.name && takenNames.has(nextName.trim().toLowerCase())) continue

      update.run(nextName, nextManufacturer, row.id)
      takenNames.delete(row.name.trim().toLowerCase())
      takenNames.add(nextName.trim().toLowerCase())
    }
  }

  const orphanedRows = db.prepare(
    `SELECT si.id, si.mic_text AS micText FROM setup_items si
       JOIN setups st ON st.id = si.setup_id
      WHERE st.studio_id = ? AND si.mic_id IS NULL AND si.mic_text IS NOT NULL`
  )
  const relink = db.prepare('UPDATE setup_items SET mic_id = ?, mic_text = NULL WHERE id = ?')

  /** Links a room's text-only sheet rows back to its own mics, by retired spelling. */
  const relinkStudio = (studioId: number): void => {
    const mics = db
      .prepare(`SELECT id, name, manufacturer FROM mics WHERE pool_type = 'studio' AND studio_id = ?`)
      .all(studioId) as MicRow[]

    // retired spelling (lowercased) → the mic in this room that now carries its current name
    const micByRetired = new Map<string, number | null>()
    for (const mic of mics) {
      const manufacturer = canonicalMicManufacturer(mic.manufacturer)
      const current = mic.name.trim().toLowerCase()
      for (const r of BERKLEE_MIC_RENAMES) {
        if (r.manufacturer.toLowerCase() !== manufacturer || r.to.toLowerCase() !== current) continue
        const retired = r.from.toLowerCase()
        // Two mics claiming one retired spelling can't be told apart, so link neither.
        micByRetired.set(retired, micByRetired.has(retired) ? null : mic.id)
      }
    }
    if (micByRetired.size === 0) return

    for (const row of orphanedRows.all(studioId) as { id: number; micText: string }[]) {
      const micId = micByRetired.get(row.micText.trim().toLowerCase())
      if (micId != null) relink.run(micId, row.id)
    }
  }

  db.transaction(() => {
    const studioIds: number[] = []
    for (const studio of seedData.studios) {
      const found = studioRow.get(studio.buildingName, studio.name) as { id: number } | undefined
      // Renamed or deleted by the user — leave it alone rather than guess which room it was.
      if (!found) continue
      studioIds.push(found.id)
      renamePool(`pool_type = 'studio' AND studio_id = ?`, [found.id])
    }
    for (const building of seedData.buildings) {
      const found = buildingRow.get(building.name) as { id: number } | undefined
      if (!found) continue
      renamePool(`pool_type = 'building' AND building_id = ?`, [found.id])
    }
    // One global pool with no owner column. Only exact matches of retired seeded spellings are
    // touched, so anything the user added themselves is left as it is.
    renamePool(`pool_type = 'faculty_reserve'`, [])

    for (const studioId of studioIds) relinkStudio(studioId)
  })()
}
