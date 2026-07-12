import type Database from 'better-sqlite3'

/** Studio folders and setup folders used to share the single `folders` table with no way to tell
 *  them apart, so a folder created while organizing setups also showed up when organizing studios
 *  (and vice versa). This migration gives every folder a `scope` ('studio' | 'setup') so the two
 *  become independent namespaces.
 *
 *  Why no table rebuild: a folder's children always share its scope (a studio folder only holds
 *  studio subfolders), so the composite UNIQUE(parent_folder_id, name) never needs to know about
 *  scope — only the ROOT level, where the studio and setup namespaces overlap, does. Root
 *  uniqueness is enforced by the droppable partial index `idx_folders_unique_root_name`, so we
 *  just swap that index to include scope and ADD the column — no risky drop/rename of `folders`
 *  (which, with foreign_keys ON, would null out every studio/setup folder_id via ON DELETE SET
 *  NULL).
 *
 *  Backfill assigns scope from what each root subtree actually contains. The 'studio' namespace
 *  holds custom studios AND studio templates (both live in grid 1 / "Manage studios"); the 'setup'
 *  namespace holds saved setups (grid 2 / "Manage setups"). A subtree with only studio-namespace
 *  items becomes 'studio'; only saved setups (or empty) stays 'setup'; a subtree with BOTH is
 *  cloned so the original tree keeps the studios+templates as 'studio' and a parallel 'setup' copy
 *  takes the saved setups (folder structure and nesting preserved on both sides). */
export function run(db: Database.Database): void {
  db.exec(`ALTER TABLE folders ADD COLUMN scope TEXT NOT NULL DEFAULT 'setup'
             CHECK (scope IN ('studio', 'setup'))`)

  db.exec('DROP INDEX IF EXISTS idx_folders_unique_root_name')
  db.exec(`CREATE UNIQUE INDEX idx_folders_unique_root_name
             ON folders(name, scope) WHERE parent_folder_id IS NULL`)

  interface FolderRow {
    id: number
    name: string
    parent_folder_id: number | null
  }

  const rootFolders = db
    .prepare('SELECT id, name, parent_folder_id FROM folders WHERE parent_folder_id IS NULL')
    .all() as FolderRow[]

  const childrenOf = db.prepare(
    'SELECT id, name, parent_folder_id FROM folders WHERE parent_folder_id = ?'
  )
  const setScope = db.prepare('UPDATE folders SET scope = ? WHERE id = ?')
  const insertClone = db.prepare(
    "INSERT INTO folders (name, parent_folder_id, scope) VALUES (?, ?, 'setup')"
  )
  // Studio namespace = custom studios + studio templates; setup namespace = saved setups.
  const studiosInFolder = db.prepare('SELECT COUNT(*) c FROM studios WHERE folder_id = ?')
  const templatesInFolder = db.prepare(
    "SELECT COUNT(*) c FROM setups WHERE folder_id = ? AND kind = 'template'"
  )
  const savedSetupsInFolder = db.prepare(
    "SELECT COUNT(*) c FROM setups WHERE folder_id = ? AND kind = 'setup'"
  )
  // Only saved setups (kind='setup') move to the cloned 'setup' tree — templates stay with studios.
  const repointSavedSetups = db.prepare(
    "UPDATE setups SET folder_id = ? WHERE folder_id = ? AND kind = 'setup'"
  )

  // Depth-first list of a subtree (root first, parents before children — clone insertion needs it).
  function subtree(rootId: number): FolderRow[] {
    const out: FolderRow[] = []
    const walk = (id: number): void => {
      const kids = childrenOf.all(id) as FolderRow[]
      for (const kid of kids) {
        out.push(kid)
        walk(kid.id)
      }
    }
    walk(rootId)
    return out
  }

  const inStudioNs = (id: number): number =>
    (studiosInFolder.get(id) as { c: number }).c + (templatesInFolder.get(id) as { c: number }).c
  const inSetupNs = (id: number): number => (savedSetupsInFolder.get(id) as { c: number }).c

  for (const root of rootFolders) {
    const nodes = [root, ...subtree(root.id)]
    const hasStudioNs = nodes.some((f) => inStudioNs(f.id) > 0)
    const hasSetupNs = nodes.some((f) => inSetupNs(f.id) > 0)

    if (hasStudioNs && !hasSetupNs) {
      for (const f of nodes) setScope.run('studio', f.id)
    } else if (hasStudioNs && hasSetupNs) {
      // Original tree keeps studios+templates as 'studio'; clone a 'setup' tree for saved setups.
      for (const f of nodes) setScope.run('studio', f.id)
      const cloneIdByOriginal = new Map<number, number>()
      for (const f of nodes) {
        const clonedParent =
          f.parent_folder_id == null ? null : cloneIdByOriginal.get(f.parent_folder_id) ?? null
        const info = insertClone.run(f.name, clonedParent)
        cloneIdByOriginal.set(f.id, Number(info.lastInsertRowid))
      }
      for (const f of nodes) {
        if (inSetupNs(f.id) > 0) repointSavedSetups.run(cloneIdByOriginal.get(f.id), f.id)
      }
    }
    // setup-only or empty: leave the default 'setup' scope untouched.
  }
}
