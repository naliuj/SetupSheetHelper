import type { Folder } from '@shared/types/setup'
import type { FolderDeleteImpact } from '@shared/types/ipc'
import { getDb } from '../index'
import { removeChannelPreset } from './channelPresetsRepo'

/** Preset folders are a separate namespace from the `folders` table (which organizes
 *  studios/setups) — see foldersRepo.ts, which this mirrors against preset_folders +
 *  channel_presets. */

interface PresetFolderRow {
  id: number
  name: string
  parent_folder_id: number | null
  created_at: string
}

function mapRow(row: PresetFolderRow): Folder {
  return { id: row.id, name: row.name, parentFolderId: row.parent_folder_id, createdAt: row.created_at }
}

/** Flat list of every preset folder — tree structure is built client-side from this. */
export function listPresetFolders(): Folder[] {
  const rows = getDb().prepare('SELECT * FROM preset_folders ORDER BY name').all() as PresetFolderRow[]
  return rows.map(mapRow)
}

export function createPresetFolder(name: string, parentFolderId: number | null = null): Folder {
  const db = getDb()
  const info = db
    .prepare('INSERT INTO preset_folders (name, parent_folder_id) VALUES (?, ?)')
    .run(name, parentFolderId)
  const row = db.prepare('SELECT * FROM preset_folders WHERE id = ?').get(info.lastInsertRowid) as PresetFolderRow
  return mapRow(row)
}

export function renamePresetFolder(id: number, name: string): void {
  getDb().prepare('UPDATE preset_folders SET name = ? WHERE id = ?').run(name, id)
}

/** All descendant folder ids of `id` (not including `id` itself) — shared by delete/impact logic. */
function collectDescendantFolderIds(db: ReturnType<typeof getDb>, id: number): number[] {
  const direct = db.prepare('SELECT id FROM preset_folders WHERE parent_folder_id = ?').all(id) as { id: number }[]
  const result: number[] = []
  for (const { id: childId } of direct) {
    result.push(childId)
    result.push(...collectDescendantFolderIds(db, childId))
  }
  return result
}

/** Counts what a delete of this folder's subtree would affect, for the confirmation prompt. */
export function getPresetFolderDeleteImpact(id: number): FolderDeleteImpact {
  const db = getDb()
  const subtreeIds = [id, ...collectDescendantFolderIds(db, id)]
  const placeholders = subtreeIds.map(() => '?').join(',')
  const presetCount = (
    db.prepare(`SELECT COUNT(*) c FROM channel_presets WHERE folder_id IN (${placeholders})`).get(...subtreeIds) as {
      c: number
    }
  ).c
  return { folderCount: subtreeIds.length - 1, items: [{ noun: 'preset', count: presetCount }] }
}

/** Deletes a folder and its entire subtree, including every preset filed anywhere within it.
 *  Transactional — all-or-nothing. */
export function deletePresetFolderRecursive(id: number): void {
  const db = getDb()
  const run = db.transaction(() => {
    const subtreeIds = [id, ...collectDescendantFolderIds(db, id)]
    const placeholders = subtreeIds.map(() => '?').join(',')

    const presetIds = (
      db.prepare(`SELECT id FROM channel_presets WHERE folder_id IN (${placeholders})`).all(...subtreeIds) as {
        id: number
      }[]
    ).map((r) => r.id)
    for (const presetId of presetIds) removeChannelPreset(presetId)

    for (let i = subtreeIds.length - 1; i >= 0; i--) {
      db.prepare('DELETE FROM preset_folders WHERE id = ?').run(subtreeIds[i])
    }
  })
  run()
}

/** Deletes exactly this one folder, promoting its direct children (subfolders and presets filed
 *  directly in it) up by one level to its own parent. */
export function deletePresetFolderPromoteContents(id: number): void {
  const db = getDb()
  const run = db.transaction(() => {
    const target = db.prepare('SELECT parent_folder_id FROM preset_folders WHERE id = ?').get(id) as
      | { parent_folder_id: number | null }
      | undefined
    if (!target) return
    const grandparentId = target.parent_folder_id

    db.prepare('UPDATE preset_folders SET parent_folder_id = ? WHERE parent_folder_id = ?').run(grandparentId, id)
    db.prepare('UPDATE channel_presets SET folder_id = ? WHERE folder_id = ?').run(grandparentId, id)

    db.prepare('DELETE FROM preset_folders WHERE id = ?').run(id)
  })
  run()
}
