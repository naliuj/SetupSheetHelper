import type Database from 'better-sqlite3'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { getBundledLayoutsDir } from '../../userDataPaths'

/** Studio A/B/E's bundled layout PDFs were replaced with better floor plans (extra labels), same
 *  page dimensions — see the "Update Studio A, B, and E room-layout PDFs" commit. seedBerkleeData
 *  only ever copies the bundled file into userData/layouts once, at first onboarding, so any
 *  install that seeded before that commit is stuck showing the old floor plan even though the
 *  bundled asset moved on. This one-time migration re-copies the new bundled PDF over the
 *  existing copy — but only when the existing copy's content still matches the known old bundled
 *  file byte-for-byte, so a studio where the user has since uploaded their own layout (replacing
 *  the seeded default) is left untouched. */
const REFRESHES: { buildingName: string; studioName: string; file: string; oldSha256: string }[] = [
  { buildingName: '150', studioName: 'Studio A', file: 'studio_a.pdf', oldSha256: 'ff201d3ac1db1277359f8913718a84a6a4429c079e476688207bbbd26c22660a' },
  { buildingName: '150', studioName: 'Studio B', file: 'studio_b.pdf', oldSha256: 'a65ebd6827eb24ccd3234e809701986f26b008b611d4ac2686176771ebe1b01a' },
  { buildingName: '150', studioName: 'Studio E', file: 'studio_e.pdf', oldSha256: '9305cde7402636492c414219c8d40e889f74aa0d0932e275fac9be2ddc75803c' }
]

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function run(db: Database.Database): void {
  const bundledDir = getBundledLayoutsDir()
  const findStudioId = db.prepare(`
    SELECT studios.id AS id FROM studios
    JOIN buildings ON buildings.id = studios.building_id
    WHERE buildings.name = ? AND studios.name = ?
  `)
  const findLayout = db.prepare(`SELECT file_path FROM room_layout_files WHERE studio_id = ?`)

  for (const refresh of REFRESHES) {
    const studio = findStudioId.get(refresh.buildingName, refresh.studioName) as { id: number } | undefined
    if (!studio) continue

    const layout = findLayout.get(studio.id) as { file_path: string } | undefined
    if (!layout || !existsSync(layout.file_path)) continue

    if (sha256(layout.file_path) !== refresh.oldSha256) continue // user has since customized this studio's layout

    const bundledPath = join(bundledDir, refresh.file)
    if (!existsSync(bundledPath)) continue
    copyFileSync(bundledPath, layout.file_path)
  }
}
