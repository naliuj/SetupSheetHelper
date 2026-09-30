import type Database from 'better-sqlite3'
import { extname } from 'node:path'
import { normalizedLayoutSize } from '@shared/constants/roomLayout'
import { readImageSize } from '../../layoutImageSize'

/** Moves Layout Mode blocks on image floor plans onto the Letter-page room size images now get.
 *
 *  An image layout's room used to be the image's own pixel size, so a small image printed as a
 *  postage stamp and made blocks look huge, and a phone photo printed at poster size (see
 *  normalizedLayoutSize). LayoutBackground now draws every image fitted to a Letter page instead,
 *  which is a uniform rescale of the room — so every block on an image layout is rescaled by the
 *  same factor here, and stays on the same spot of the drawing. PDF layouts and blank sheets were
 *  always in page units and are not touched.
 *
 *  The factor comes from the image file itself (readImageSize), because the renderer is not
 *  available to ask. Where it can't be read — the file is gone, or it's an SVG without an absolute
 *  size — the layout record is flagged `legacy_pixel_units` and keeps its pixel room for good,
 *  rather than rescaling its room without rescaling its blocks. A later upload clears the flag
 *  (the repos' upserts reset it), since that is a new file with no blocks placed against it. */
export function run(db: Database.Database): void {
  db.exec('ALTER TABLE room_layout_files ADD COLUMN legacy_pixel_units INTEGER NOT NULL DEFAULT 0')
  db.exec('ALTER TABLE setup_layout_overrides ADD COLUMN legacy_pixel_units INTEGER NOT NULL DEFAULT 0')

  const isImage = (path: string | null): path is string => !!path && extname(path).toLowerCase() !== '.pdf'

  // One measurement per file, shared by every setup that uses it.
  const sizes = new Map<string, { width: number; height: number } | null>()
  const sizeOf = (path: string): { width: number; height: number } | null => {
    if (!sizes.has(path)) sizes.set(path, readImageSize(path))
    return sizes.get(path) ?? null
  }

  db.transaction(() => {
    const studioFiles = db.prepare('SELECT id, file_path AS filePath FROM room_layout_files').all() as {
      id: number
      filePath: string
    }[]
    const overrideFiles = db
      .prepare(`SELECT id, file_path AS filePath FROM setup_layout_overrides WHERE kind = 'file'`)
      .all() as { id: number; filePath: string | null }[]

    const flagStudio = db.prepare('UPDATE room_layout_files SET legacy_pixel_units = 1 WHERE id = ?')
    const flagOverride = db.prepare('UPDATE setup_layout_overrides SET legacy_pixel_units = 1 WHERE id = ?')
    for (const f of studioFiles) if (isImage(f.filePath) && !sizeOf(f.filePath)) flagStudio.run(f.id)
    for (const f of overrideFiles) if (isImage(f.filePath) && !sizeOf(f.filePath)) flagOverride.run(f.id)

    // Each setup's effective layout, resolved the way effectiveLayoutRepo does: its own override
    // first, then its studio's file.
    const setups = db
      .prepare(
        `SELECT s.id AS id,
                o.kind AS overrideKind, o.file_path AS overridePath,
                f.file_path AS studioPath
           FROM setups s
           LEFT JOIN setup_layout_overrides o ON o.setup_id = s.id
           LEFT JOIN room_layout_files f ON f.studio_id = s.studio_id`
      )
      .all() as { id: number; overrideKind: 'blank' | 'file' | null; overridePath: string | null; studioPath: string | null }[]

    const rescale = db.prepare(
      `UPDATE room_layout_blocks
          SET x = x * @s, y = y * @s, width = width * @s, height = height * @s,
              font_size = CASE WHEN font_size IS NULL THEN NULL ELSE font_size * @s END
        WHERE setup_id = @setupId`
    )
    for (const setup of setups) {
      if (setup.overrideKind === 'blank') continue
      const path = setup.overrideKind === 'file' ? setup.overridePath : setup.studioPath
      if (!isImage(path)) continue
      const size = sizeOf(path)
      if (!size) continue
      const { scale } = normalizedLayoutSize(size.width, size.height)
      if (Math.abs(scale - 1) < 1e-9) continue
      rescale.run({ s: scale, setupId: setup.id })
    }
  })()
}
