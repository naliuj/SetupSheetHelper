import type Database from 'better-sqlite3'
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import seedData from './berkleeSeedData.json'
import { getBundledLayoutsDir, getLayoutsDir } from '../../userDataPaths'

/** Room-layout PDFs bundled with the app (resources/layouts, see package.json's
 *  extraResources) — sourced from real Berklee setup-sheet PDFs, cropped to just the floor-plan
 *  page and reoriented so each reads upright (landscape where the room is naturally wide,
 *  portrait where it's naturally tall/narrow — see the room's own dimensions, not a fixed rule).
 *  No file for Studio A76 (none available yet). Dimensions are pre-computed at generation time
 *  (see resources/layouts, produced from a one-off wrap script) since reading them here would
 *  require an async PDF parse inside this synchronous migration transaction. */
const BUNDLED_LAYOUTS: { buildingName: string; studioName: string; file: string; widthPt: number; heightPt: number }[] = [
  { buildingName: '160', studioName: 'Studio 1', file: 'studio_1.pdf', widthPt: 871, heightPt: 569 },
  { buildingName: '160', studioName: 'Studio 2', file: 'studio_2.pdf', widthPt: 691, heightPt: 482 },
  { buildingName: '160', studioName: 'Studio 3', file: 'studio_3.pdf', widthPt: 757, heightPt: 506 },
  { buildingName: '150', studioName: 'Studio A', file: 'studio_a.pdf', widthPt: 792, heightPt: 612 },
  { buildingName: '150', studioName: 'Studio B', file: 'studio_b.pdf', widthPt: 612, heightPt: 792 },
  { buildingName: '150', studioName: 'Studio E', file: 'studio_e.pdf', widthPt: 612, heightPt: 792 }
]

/** Seeds the real Berklee institutional data (buildings, studios, their studio/building/
 *  faculty-reserve gear, and room-layout PDFs) into a fresh install so new users get a working
 *  baseline instead of a completely empty app. Guarded by `buildings` already having rows —
 *  covers both "already seeded" and "this is the developer's own live DB, which already has
 *  this exact data" in one check, so this safely no-ops rather than duplicating anything.
 *  User-created (buildingless) studios, setups, and personal gear are deliberately never part
 *  of this seed.
 *
 *  Data comes from src/main/db/migrations/berkleeSeedData.json, regenerated from the live DB via
 *  scripts/export_berklee_seed_data.cjs whenever real Berklee data changes. */
export function run(db: Database.Database): void {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM buildings').get() as { c: number }
  if (existing.c > 0) return

  const insertBuilding = db.prepare('INSERT INTO buildings (name) VALUES (?)')
  const insertStudio = db.prepare('INSERT INTO studios (building_id, name) VALUES (?, ?)')
  const insertMic = db.prepare(
    `INSERT INTO mics (pool_type, studio_id, building_id, name, manufacturer, category, notes, quantity, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertOutboard = db.prepare(
    `INSERT INTO outboard_gear (pool_type, studio_id, name, manufacturer, category, notes, quantity, sort_order)
     VALUES ('studio', ?, ?, ?, ?, ?, ?, ?)`
  )

  const buildingIdByName = new Map<string, number>()
  for (const b of seedData.buildings) {
    const info = insertBuilding.run(b.name)
    buildingIdByName.set(b.name, Number(info.lastInsertRowid))
  }

  const studioIdByKey = new Map<string, number>()
  for (const s of seedData.studios) {
    const buildingId = buildingIdByName.get(s.buildingName)
    if (buildingId == null) throw new Error(`Seed data error: unknown building "${s.buildingName}"`)
    const info = insertStudio.run(buildingId, s.name)
    studioIdByKey.set(`${s.buildingName}::${s.name}`, Number(info.lastInsertRowid))
  }

  for (const m of seedData.mics) {
    if (m.poolType === 'studio') {
      const studioId = studioIdByKey.get(`${m.buildingName}::${m.studioName}`)
      if (studioId == null) throw new Error(`Seed data error: unknown studio "${m.buildingName}/${m.studioName}"`)
      insertMic.run('studio', studioId, null, m.name, m.manufacturer, m.category, m.notes, m.quantity, m.sortOrder)
    } else if (m.poolType === 'building') {
      const buildingId = m.buildingName ? buildingIdByName.get(m.buildingName) : undefined
      if (buildingId == null) throw new Error(`Seed data error: unknown building "${m.buildingName}"`)
      insertMic.run('building', null, buildingId, m.name, m.manufacturer, m.category, m.notes, m.quantity, m.sortOrder)
    } else {
      insertMic.run('faculty_reserve', null, null, m.name, m.manufacturer, m.category, m.notes, m.quantity, m.sortOrder)
    }
  }

  for (const o of seedData.outboard) {
    const studioId = studioIdByKey.get(`${o.buildingName}::${o.studioName}`)
    if (studioId == null) throw new Error(`Seed data error: unknown studio "${o.buildingName}/${o.studioName}"`)
    insertOutboard.run(studioId, o.name, o.manufacturer, o.category, o.notes, o.quantity, o.sortOrder)
  }

  const bundledDir = getBundledLayoutsDir()
  const insertLayout = db.prepare(
    `INSERT INTO room_layout_pdfs (studio_id, file_path, original_name, page_width_pt, page_height_pt)
     VALUES (?, ?, ?, ?, ?)`
  )
  for (const layout of BUNDLED_LAYOUTS) {
    const studioId = studioIdByKey.get(`${layout.buildingName}::${layout.studioName}`)
    if (studioId == null) throw new Error(`Seed data error: unknown studio "${layout.buildingName}/${layout.studioName}"`)
    const sourcePath = join(bundledDir, layout.file)
    if (!existsSync(sourcePath)) continue // defensive — missing bundled asset shouldn't break the whole seed
    const destPath = join(getLayoutsDir(), `studio_${studioId}.pdf`)
    copyFileSync(sourcePath, destPath)
    insertLayout.run(studioId, destPath, layout.file, layout.widthPt, layout.heightPt)
  }
}
