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

export interface FolderPickerOption {
  folder: Folder
  depth: number
}

/** Depth-first flatten of a folder tree, for indentation in a flat <select>. */
export function flattenFolderTreeForPicker(tree: FolderTreeNode[], depth = 0): FolderPickerOption[] {
  return tree.flatMap((node) => [
    { folder: node, depth },
    ...flattenFolderTreeForPicker(node.children, depth + 1)
  ])
}

const NBSP = String.fromCharCode(160)
const TREE_BRANCH = String.fromCharCode(0x2514) + ' '

/** Indentation prefix for a flat <option> label - non-breaking spaces so it doesn't collapse. */
export function indentedFolderLabel(name: string, depth: number): string {
  if (depth === 0) return name
  return NBSP.repeat(depth * 2) + TREE_BRANCH + name
}
