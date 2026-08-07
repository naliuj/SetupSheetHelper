import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ChevronDown, ChevronRight, Folder, Pencil, Plus, Trash2 } from 'lucide-react'
import type { FolderTreeNode as FolderTreeNodeType } from '@shared/types/setup'

interface Props {
  node: FolderTreeNodeType
  depth: number
  selectedFolderId: number | null
  onSelect: (id: number) => void
  /** CRUD actions are optional — omit all three for a read-only picker (e.g. the Split View setup
   *  picker), which hides the New Subfolder/Rename/Delete buttons entirely rather than disabling
   *  them, since a browse-only dialog shouldn't offer folder mutation at all. */
  onCreateSubfolder?: (parentId: number) => void
  onRename?: (id: number, currentName: string) => void
  onDelete?: (id: number) => void
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
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="folder-tree-toggle" />
        )}
        <button className="folder-tree-label tree-label" onClick={() => onSelect(node.id)}>
          <Folder className="home-icon" size={15} aria-hidden="true" />
          <span className="folder-tree-name">{node.name}</span>
        </button>
        {onCreateSubfolder && (
          <button className="folder-tree-action" title="New Subfolder" onClick={() => onCreateSubfolder(node.id)}>
            <Plus size={15} aria-hidden="true" />
          </button>
        )}
        {onRename && (
          <button className="folder-tree-action" title="Rename" onClick={() => onRename(node.id, node.name)}>
            <Pencil size={14} aria-hidden="true" />
          </button>
        )}
        {onDelete && (
          <button className="folder-tree-action" title="Delete" onClick={() => onDelete(node.id)}>
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
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
