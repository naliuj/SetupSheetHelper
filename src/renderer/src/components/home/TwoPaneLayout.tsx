import { buildFolderTree, flattenFolderTreeForPicker } from '@renderer/state/folderTree'
import type { HomeLayoutViewProps } from './HomeSection'
import EntryRow from './EntryRow'

/** Two-pane / file-manager layout: a folder list on the left, the selected folder's contents on
 *  the right. The root ("All") shows top-level entries. */
export default function TwoPaneLayout({
  folders,
  entries,
  selectedFolderId,
  onSelectFolder,
  emptyMessage
}: HomeLayoutViewProps): JSX.Element {
  const flatFolders = flattenFolderTreeForPicker(buildFolderTree(folders))
  const entriesHere = entries.filter((e) => e.folderId === selectedFolderId)
  const atRoot = selectedFolderId === null

  return (
    <div className="two-pane">
      <div className="two-pane-sidebar">
        <button
          type="button"
          className={`folder-tree-row home-selectable${atRoot ? ' selected' : ''}`}
          style={{ paddingLeft: 10 }}
          onClick={() => onSelectFolder(null)}
        >
          🗂 All
        </button>
        {flatFolders.map(({ folder, depth }) => (
          <button
            key={folder.id}
            type="button"
            className={`folder-tree-row home-selectable${selectedFolderId === folder.id ? ' selected' : ''}`}
            style={{ paddingLeft: 10 + depth * 16 }}
            onClick={() => onSelectFolder(folder.id)}
          >
            📁 {folder.name}
          </button>
        ))}
      </div>
      <div className="two-pane-content">
        {entriesHere.length > 0 ? (
          entriesHere.map((entry) => <EntryRow key={entry.id} entry={entry} />)
        ) : (
          <div className="empty-state">{emptyMessage ?? 'Nothing in this folder yet.'}</div>
        )}
      </div>
    </div>
  )
}
