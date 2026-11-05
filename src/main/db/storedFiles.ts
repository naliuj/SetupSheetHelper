import { rmSync } from 'node:fs'
import { getDb } from './index'
import { removeLayoutFileIfUnused } from '../pdf/importLayoutFile'

/** Files in userData that layout and patchbay rows name. The rows cascade away with their setup or
 *  studio; the files don't, so every delete collects them first and tidies them up afterward. */
export interface StoredFiles {
  layouts: string[]
  patchbays: string[]
}

/** Every file the given setups and studios name, including those of every setup under the given
 *  studios. Read BEFORE the delete, while the rows still exist. */
export function collectStoredFiles(setupIds: number[], studioIds: number[]): StoredFiles {
  const db = getDb()
  // json_each so two lists of any length bind as two parameters.
  const setups = JSON.stringify(setupIds)
  const studios = JSON.stringify(studioIds)
  const layouts = db
    .prepare(
      `SELECT file_path FROM setup_layout_overrides
       WHERE file_path IS NOT NULL AND (
         setup_id IN (SELECT value FROM json_each(@setups))
         OR setup_id IN (SELECT id FROM setups WHERE studio_id IN (SELECT value FROM json_each(@studios)))
       )
       UNION SELECT file_path FROM room_layout_files WHERE studio_id IN (SELECT value FROM json_each(@studios))`
    )
    .all({ setups, studios }) as { file_path: string }[]
  const patchbays = db
    .prepare('SELECT file_path FROM patchbay_files WHERE studio_id IN (SELECT value FROM json_each(?))')
    .all(studios) as { file_path: string }[]
  return { layouts: layouts.map((r) => r.file_path), patchbays: patchbays.map((r) => r.file_path) }
}

/** Deletes each collected file no row names any more. Call it after the delete has committed.
 *
 *  A no-op inside a transaction: the rows aren't really gone until the outermost one commits, and
 *  a rollback would leave them naming files already deleted. The outermost delete (a studio or
 *  folder cascade) collects for everything beneath it instead. Best effort throughout: a file left
 *  behind is only clutter. */
export function removeStoredFilesIfUnused(files: StoredFiles): void {
  const db = getDb()
  if (db.inTransaction) return
  for (const path of files.layouts) removeLayoutFileIfUnused(path)
  const stillUsed = db.prepare('SELECT 1 FROM patchbay_files WHERE file_path = ?')
  for (const path of files.patchbays) {
    if (stillUsed.get(path)) continue
    try {
      rmSync(path, { force: true })
    } catch {
      // non-critical: an orphaned file in the patchbays folder
    }
  }
}
