import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { FolderTreeNode as FolderTreeNodeType } from '@shared/types/setup'

interface Props {
  node: FolderTreeNodeType
  depth: number
  selectedFolderId: number | null
  onSelect: (id: number) => void
  onCreateSubfolder: (parentId: number) => void
  onRename: (id: number, currentName: string) => void
  onDelete: (id: number) => void
}

export default function FolderTreeNode({
  node,
  depth,
  selectedFolderId,
  onSelect,
  onCreateSubfolder,
  onRename,
  onDelete
}: Props): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const { isOver, setNodeRef } = useDroppable({ id: `folder-${node.id}` })
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        ref={setNodeRef}
        className={`folder-tree-row ${selectedFolderId === node.id ? 'selected' : ''} ${isOver ? 'drop-target' : ''}`}
        style={{ paddingLeft: 10 + depth * 16 }}
      >
        {hasChildren ? (
          <button className="folder-tree-toggle" onClick={() => setExpanded((e) => !e)}>
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="folder-tree-toggle" />
        )}
        <button className="folder-tree-label" onClick={() => onSelect(node.id)}>
          📁 {node.name}
        </button>
        <button className="folder-tree-action" title="New Subfolder" onClick={() => onCreateSubfolder(node.id)}>
          +
        </button>
        <button className="folder-tree-action" title="Rename" onClick={() => onRename(node.id, node.name)}>
          ✎
        </button>
        <button className="folder-tree-action" title="Delete" onClick={() => onDelete(node.id)}>
          🗑
        </button>
      </div>
      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <FolderTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedFolderId={selectedFolderId}
            onSelect={onSelect}
            onCreateSubfolder={onCreateSubfolder}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
    </div>
  )
}
