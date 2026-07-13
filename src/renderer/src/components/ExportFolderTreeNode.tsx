import { useState } from 'react'
import { ChevronDown, ChevronRight, Folder } from 'lucide-react'
import type { Studio } from '@shared/types/entities'
import type { FolderTreeNode as FolderTreeNodeType } from '@shared/types/setup'

interface Props {
  node: FolderTreeNodeType
  depth: number
  studiosByFolder: Map<number | null, Studio[]>
  selectedIds: Set<number>
  onToggleStudio: (id: number) => void
  onSelectFolder: (ids: number[]) => void
}

/** Collects every studio id in this folder's subtree (itself + all descendant folders), for the
 *  "Select folder" bulk-select action. Purely client-side — no backend call needed. */
function collectSubtreeStudioIds(node: FolderTreeNodeType, studiosByFolder: Map<number | null, Studio[]>): number[] {
  const own = (studiosByFolder.get(node.id) ?? []).map((s) => s.id)
  return [...own, ...node.children.flatMap((child) => collectSubtreeStudioIds(child, studiosByFolder))]
}

/** Read-only folder-tree row for the studio export picker — a simpler sibling of FolderTreeNode.tsx
 *  (no drag-and-drop, no create/rename/delete) since this tree only browses and selects, never
 *  reorganizes. Renders this folder's own studios as checkbox leaves, then recurses into children. */
export default function ExportFolderTreeNode({
  node,
  depth,
  studiosByFolder,
  selectedIds,
  onToggleStudio,
  onSelectFolder
}: Props): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const studiosHere = studiosByFolder.get(node.id) ?? []
  const hasContent = node.children.length > 0 || studiosHere.length > 0

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
          title="Select all studios in this folder"
          onClick={() => onSelectFolder(collectSubtreeStudioIds(node, studiosByFolder))}
        >
          Select
        </button>
      </div>
      {expanded && (
        <>
          {studiosHere.map((studio) => (
            <label
              key={studio.id}
              className="folder-tree-row"
              style={{ paddingLeft: (depth + 1) * 16 + 20, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(studio.id)}
                onChange={() => onToggleStudio(studio.id)}
              />
              {studio.name}
            </label>
          ))}
          {node.children.map((child) => (
            <ExportFolderTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              studiosByFolder={studiosByFolder}
              selectedIds={selectedIds}
              onToggleStudio={onToggleStudio}
              onSelectFolder={onSelectFolder}
            />
          ))}
        </>
      )}
    </div>
  )
}
