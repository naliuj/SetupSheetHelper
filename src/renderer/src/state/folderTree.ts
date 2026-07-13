import type { Folder, FolderTreeNode } from '@shared/types/setup'

/** Builds a nested tree from a flat folder list, sorted alphabetically at every level. */
export function buildFolderTree(folders: Folder[]): FolderTreeNode[] {
  const byParent = new Map<number | null, Folder[]>()
  for (const folder of folders) {
    const key = folder.parentFolderId
    const siblings = byParent.get(key) ?? []
    siblings.push(folder)
    byParent.set(key, siblings)
  }

  function build(parentId: number | null): FolderTreeNode[] {
    return (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((folder) => ({ ...folder, children: build(folder.id) }))
  }

  return build(null)
}

/** Full ancestor chain from root down to (and including) `folderId`, via parentFolderId links —
 *  for breadcrumb trails in the home layouts. */
export function folderAncestry(folders: Folder[], folderId: number): Folder[] {
  const chain: Folder[] = []
  let current: Folder | undefined = folders.find((f) => f.id === folderId)
  while (current) {
    chain.unshift(current)
    const parentId: number | null = current.parentFolderId
    current = parentId != null ? folders.find((f) => f.id === parentId) : undefined
  }
  return chain
}

export interface FolderPickerOption {
  folder: Folder
  depth: number
}

/** Depth-first flatten of a folder tree, carrying each node's depth for indentation. */
export function flattenFolderTreeForPicker(tree: FolderTreeNode[], depth = 0): FolderPickerOption[] {
  return tree.flatMap((node) => [
    { folder: node, depth },
    ...flattenFolderTreeForPicker(node.children, depth + 1)
  ])
}
