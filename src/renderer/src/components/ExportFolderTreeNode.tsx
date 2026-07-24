import { useState } from 'react'
import { ChevronDown, ChevronRight, Folder } from 'lucide-react'
import type { FolderTreeNode as FolderTreeNodeType } from '@shared/types/setup'

interface ExportableItem {
  id: number
  name: string
}

interface Props<T extends ExportableItem> {
  node: FolderTreeNodeType
  depth: number
  itemsByFolder: Map<number | null, T[]>
  selectedIds: Set<number>
  onToggleItem: (id: number) => void
  onSelectFolder: (ids: number[]) => void
}

/** Collects every item id in this folder's subtree (itself + all descendant folders), for the
 *  "Select folder" bulk-select action. Purely client-side — no backend call needed. */
function collectSubtreeItemIds<T extends ExportableItem>(
  node: FolderTreeNodeType,
  itemsByFolder: Map<number | null, T[]>
): number[] {
  const own = (itemsByFolder.get(node.id) ?? []).map((item) => item.id)
  return [...own, ...node.children.flatMap((child) => collectSubtreeItemIds(child, itemsByFolder))]
}

/** Read-only folder-tree row for export pickers (studios, setups) — a simpler sibling of
 *  FolderTreeNode.tsx (no drag-and-drop, no create/rename/delete) since this tree only browses
 *  and selects, never reorganizes. Renders this folder's own items as checkbox leaves, then
 *  recurses into children. Generic over any `{id, name}` item so both the studio and setup
 *  export pickers share it. */
export default function ExportFolderTreeNode<T extends ExportableItem>({
  node,
  depth,
  itemsByFolder,
  selectedIds,
  onToggleItem,
  onSelectFolder
}: Props<T>): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const itemsHere = itemsByFolder.get(node.id) ?? []
  const hasContent = node.children.length > 0 || itemsHere.length > 0

  return (
    <div>
      <div className="folder-tree-row" style={{ paddingLeft: depth * 16 }}>
        {hasContent ? (
          <button className="folder-tree-toggle" onClick={() => setExpanded((e) => !e)}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="folder-tree-toggle" />
        )}
        <span className="folder-tree-label tree-label">
          <Folder className="home-icon" size={15} aria-hidden="true" />
          <span className="folder-tree-name">{node.name}</span>
        </span>
        <button
          className="folder-tree-action"
          title="Select all in this folder"
          onClick={() => onSelectFolder(collectSubtreeItemIds(node, itemsByFolder))}
        >
          Select
        </button>
      </div>
      {expanded && (
        <>
          {itemsHere.map((item) => (
            <label
              key={item.id}
              className="folder-tree-row"
              style={{ paddingLeft: (depth + 1) * 16 + 20, cursor: 'pointer' }}
            >
              <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => onToggleItem(item.id)} />
              {item.name}
            </label>
          ))}
          {node.children.map((child) => (
            <ExportFolderTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              itemsByFolder={itemsByFolder}
              selectedIds={selectedIds}
              onToggleItem={onToggleItem}
              onSelectFolder={onSelectFolder}
            />
          ))}
        </>
      )}
    </div>
  )
}
