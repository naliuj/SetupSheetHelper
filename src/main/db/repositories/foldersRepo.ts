import type { Folder, FolderScope } from '@shared/types/setup'
import type { FolderDeleteImpact } from '@shared/types/ipc'
import { getDb } from '../index'
import { removeStudioCascade } from './studiosRepo'
import { removeSetup } from './setupsRepo'

interface FolderRow {
  id: number
  name: string
  parent_folder_id: number | null
  created_at: string
  scope: FolderScope
}

function mapRow(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    parentFolderId: row.parent_folder_id,
    createdAt: row.created_at,
    scope: row.scope
  }
}

/** Flat list of every folder in one scope ('studio' | 'setup') — tree structure is built
 *  client-side from this. Studio and setup folders are independent namespaces (see migration 020),
 *  so callers pass the scope for the list they're organizing. */
export function listFolders(scope: FolderScope): Folder[] {
  const rows = getDb()
    .prepare('SELECT * FROM folders WHERE scope = ? ORDER BY name')
    .all(scope) as FolderRow[]
  return rows.map(mapRow)
}

export function createFolder(
  name: string,
  parentFolderId: number | null = null,
  scope: FolderScope = 'setup'
): Folder {
  const db = getDb()
  const info = db
    .prepare('INSERT INTO folders (name, parent_folder_id, scope) VALUES (?, ?, ?)')
    .run(name, parentFolderId, scope)
  const row = db.prepare('SELECT * FROM folders WHERE id = ?').get(info.lastInsertRowid) as FolderRow
  return mapRow(row)
}

export function renameFolder(id: number, name: string): void {
  getDb().prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id)
}

/** All descendant folder ids of `id` (not including `id` itself) — shared by delete/impact logic. */
function collectDescendantFolderIds(db: ReturnType<typeof getDb>, id: number): number[] {
  const direct = db.prepare('SELECT id FROM folders WHERE parent_folder_id = ?').all(id) as { id: number }[]
  const result: number[] = []
  for (const { id: childId } of direct) {
    result.push(childId)
    result.push(...collectDescendantFolderIds(db, childId))
  }
  return result
}

/** Counts what a delete of this folder's subtree would affect, for the confirmation prompt. */
export function getFolderDeleteImpact(id: number): FolderDeleteImpact {
  const db = getDb()
  const subtreeIds = [id, ...collectDescendantFolderIds(db, id)]
  const placeholders = subtreeIds.map(() => '?').join(',')
  const studioCount = (
    db.prepare(`SELECT COUNT(*) c FROM studios WHERE folder_id IN (${placeholders})`).get(...subtreeIds) as {
      c: number
    }
  ).c
  const setupCount = (
    db.prepare(`SELECT COUNT(*) c FROM setups WHERE folder_id IN (${placeholders})`).get(...subtreeIds) as {
      c: number
    }
  ).c
  return {
    folderCount: subtreeIds.length - 1,
    items: [
      { noun: 'studio', count: studioCount },
      { noun: 'setup', count: setupCount }
    ]
  }
}

/**
 * Deletes a folder and its entire subtree, including every studio and setup/template
 * filed anywhere within it. Transactional — all-or-nothing.
 */
export function deleteFolderRecursive(id: number): void {
  const db = getDb()
  const run = db.transaction(() => {
    const subtreeIds = [id, ...collectDescendantFolderIds(db, id)]
    const placeholders = subtreeIds.map(() => '?').join(',')

    const studioIds = (
      db.prepare(`SELECT id FROM studios WHERE folder_id IN (${placeholders})`).all(...subtreeIds) as {
        id: number
      }[]
    ).map((r) => r.id)
    for (const studioId of studioIds) removeStudioCascade(studioId)

    // Setups/templates filed directly in the subtree that weren't already removed via their
    // studio above (a setup's folder_id and its studio's folder_id can differ).
    const setupIds = (
      db.prepare(`SELECT id FROM setups WHERE folder_id IN (${placeholders})`).all(...subtreeIds) as {
        id: number
      }[]
    ).map((r) => r.id)
    for (const setupId of setupIds) removeSetup(setupId)

    // Delete folders leaves-up (defensive ordering; the FK's ON DELETE CASCADE would also
    // handle this if we just deleted `id`, but explicit order keeps behavior obvious).
    for (let i = subtreeIds.length - 1; i >= 0; i--) {
      db.prepare('DELETE FROM folders WHERE id = ?').run(subtreeIds[i])
    }
  })
  run()
}

/**
 * Deletes exactly this one folder, promoting its DIRECT children (subfolders and any
 * studios/setups filed directly in it) up by one level to its own parent. Anything deeper —
 * a grandchild folder's own contents — is untouched, since the folder actually containing
 * it isn't being deleted.
 */
export function deleteFolderPromoteContents(id: number): void {
  const db = getDb()
  const run = db.transaction(() => {
    const target = db.prepare('SELECT parent_folder_id FROM folders WHERE id = ?').get(id) as
      | { parent_folder_id: number | null }
      | undefined
    if (!target) return
    const grandparentId = target.parent_folder_id

    db.prepare('UPDATE folders SET parent_folder_id = ? WHERE parent_folder_id = ?').run(grandparentId, id)
    db.prepare('UPDATE studios SET folder_id = ? WHERE folder_id = ?').run(grandparentId, id)
    db.prepare('UPDATE setups SET folder_id = ? WHERE folder_id = ?').run(grandparentId, id)

    db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  })
  run()
}
