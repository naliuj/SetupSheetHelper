import { useState } from 'react'
import type { HomeLayoutViewProps } from './HomeSection'
import EntryRow from './EntryRow'

/** Miller-columns layout (Finder column view): selecting a folder opens its contents in the next
 *  pane to the right. Good for navigating deep nesting without losing the trail. */
export default function MillerColumnsLayout({
  folders,
  entries,
  leadingItems,
  emptyMessage
}: HomeLayoutViewProps): JSX.Element {
  // Selected folder id per column; column k's parent is path[k-1] (root for k=0).
  const [path, setPath] = useState<number[]>([])

  const parentIds: (number | null)[] = [null, ...path]

  const hasAnything = folders.length > 0 || entries.some((e) => e.folderId === null) || !!leadingItems?.length
  if (!hasAnything) return <div className="empty-state">{emptyMessage ?? 'Nothing here yet.'}</div>

  function selectFolder(columnIndex: number, folderId: number): void {
    setPath((prev) => [...prev.slice(0, columnIndex), folderId])
  }

  return (
    <div className="miller">
      {parentIds.map((parentId, columnIndex) => {
        const childFolders = folders.filter((f) => f.parentFolderId === parentId)
        const childEntries = entries.filter((e) => e.folderId === parentId)
        const selectedInColumn = path[columnIndex] ?? null
        const showLeading = columnIndex === 0 && !!leadingItems?.length
        const empty = childFolders.length === 0 && childEntries.length === 0
        return (
          <div className="miller-col" key={columnIndex}>
            {showLeading &&
              leadingItems!.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="folder-tree-row home-selectable miller-folder"
                  style={{ paddingLeft: 10 }}
                  onClick={item.onActivate}
                >
                  <span className="miller-folder-name">📁 {item.label}</span>
                  <span className="miller-folder-caret">›</span>
                </button>
              ))}
            {childFolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={`folder-tree-row home-selectable miller-folder${
                  selectedInColumn === folder.id ? ' selected' : ''
                }`}
                style={{ paddingLeft: 10 }}
                onClick={() => selectFolder(columnIndex, folder.id)}
              >
                <span className="miller-folder-name">📁 {folder.name}</span>
                <span className="miller-folder-caret">›</span>
              </button>
            ))}
            {childEntries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
            {empty && !showLeading && (
              <div className="empty-state" style={{ padding: 10, fontSize: 12 }}>
                Empty
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
