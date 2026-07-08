import type { ReactNode } from 'react'
import type { Folder } from '@shared/types/setup'

interface Props<T> {
  title: string
  folders: Folder[]
  items: T[]
  getFolderId: (item: T) => number | null
  renderItem: (item: T) => ReactNode
  selectedFolderId: number | null
  onSelectFolder: (folderId: number | null) => void
  /** Rendered as extra tiles alongside folder tiles, only in the ungrouped (top-level) view. */
  leadingTiles?: ReactNode
  emptyMessage?: string
  /** Rendered inline with the section title, e.g. a "Manage" button. */
  headerAction?: ReactNode
}

/** Full ancestor chain from root down to (and including) `folderId`, via parentFolderId links. */
function folderAncestry(folders: Folder[], folderId: number): Folder[] {
  const chain: Folder[] = []
  let current: Folder | undefined = folders.find((f) => f.id === folderId)
  while (current) {
    chain.unshift(current)
    const parentId: number | null = current.parentFolderId
    current = parentId != null ? folders.find((f) => f.id === parentId) : undefined
  }
  return chain
}

/** Nested folder tiles + drill-down + items grid, shared by Studio Templates and Saved Setups. */
export default function FolderGroupedGrid<T>({
  title,
  folders,
  items,
  getFolderId,
  renderItem,
  selectedFolderId,
  onSelectFolder,
  leadingTiles,
  emptyMessage,
  headerAction
}: Props<T>): JSX.Element {
  const childFolders = folders.filter((f) => f.parentFolderId === selectedFolderId)
  const itemsHere = items.filter((item) => getFolderId(item) === selectedFolderId)
  const ancestry = selectedFolderId != null ? folderAncestry(folders, selectedFolderId) : []
  const atTopLevel = selectedFolderId === null
  const showEmptyState = childFolders.length === 0 && itemsHere.length === 0 && !(atTopLevel && leadingTiles)

  return (
    <div>
      <div
        className="section-title"
        style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span>{title}</span>
        {headerAction}
      </div>
      {!atTopLevel && (
        <div className="nav-crumbs">
          <button onClick={() => onSelectFolder(null)}>{title}</button>
          {ancestry.map((folder, index) => (
            <span key={folder.id}>
              {' / '}
              {index === ancestry.length - 1 ? folder.name : (
                <button onClick={() => onSelectFolder(folder.id)}>{folder.name}</button>
              )}
            </span>
          ))}
        </div>
      )}
      {showEmptyState ? (
        <div className="empty-state">{emptyMessage ?? 'Nothing here yet.'}</div>
      ) : (
        <div className="list-grid">
          {atTopLevel && leadingTiles}
          {childFolders.map((folder) => (
            <button key={folder.id} className="card clickable" onClick={() => onSelectFolder(folder.id)}>
              <div className="card-title">📁 {folder.name}</div>
            </button>
          ))}
          {itemsHere.map((item) => renderItem(item))}
        </div>
      )}
    </div>
  )
}
