import { folderAncestry } from '@renderer/state/folderTree'
import type { HomeEntry, HomeLayoutViewProps } from './HomeSection'

/** The original card-grid home layout: folders as tiles you drill into, items as cards. Preserves
 *  the studio card's title + "Edit inventory" two-button structure. */
export default function BlocksLayout({
  folders,
  entries,
  selectedFolderId,
  onSelectFolder,
  leadingTiles,
  emptyMessage
}: HomeLayoutViewProps): JSX.Element {
  const childFolders = folders.filter((f) => f.parentFolderId === selectedFolderId)
  const entriesHere = entries.filter((e) => e.folderId === selectedFolderId)
  const ancestry = selectedFolderId != null ? folderAncestry(folders, selectedFolderId) : []
  const atTopLevel = selectedFolderId === null
  const showEmpty = childFolders.length === 0 && entriesHere.length === 0 && !(atTopLevel && leadingTiles)

  return (
    <>
      {!atTopLevel && (
        <div className="nav-crumbs">
          <button onClick={() => onSelectFolder(null)}>Top</button>
          {ancestry.map((folder, i) => (
            <span key={folder.id}>
              {' / '}
              {i === ancestry.length - 1 ? (
                folder.name
              ) : (
                <button onClick={() => onSelectFolder(folder.id)}>{folder.name}</button>
              )}
            </span>
          ))}
        </div>
      )}
      {showEmpty ? (
        <div className="empty-state">{emptyMessage ?? 'Nothing here yet.'}</div>
      ) : (
        <div className="list-grid">
          {atTopLevel && leadingTiles}
          {childFolders.map((folder) => (
            <button key={folder.id} className="card clickable" onClick={() => onSelectFolder(folder.id)}>
              <div className="card-title">📁 {folder.name}</div>
            </button>
          ))}
          {entriesHere.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </>
  )
}

function EntryCard({ entry }: { entry: HomeEntry }): JSX.Element {
  const title = (
    <>
      <div className="card-title">{entry.icon ? `${entry.icon} ${entry.label}` : entry.label}</div>
      {entry.meta && <div className="card-sub">{entry.meta}</div>}
    </>
  )
  // Entries with a secondary action (studios → "Edit inventory") need the title as an inner button
  // inside a plain card so the two actions don't nest; simpler entries are a single clickable card.
  if (entry.secondaryAction) {
    return (
      <div className="card">
        <button
          className="clickable"
          style={{ background: 'none', border: 'none', color: 'inherit', textAlign: 'left', padding: 0, width: '100%' }}
          onClick={entry.onActivate}
        >
          {title}
        </button>
        <button className="btn small" style={{ marginTop: 6 }} onClick={entry.secondaryAction.onClick}>
          {entry.secondaryAction.label}
        </button>
      </div>
    )
  }
  return (
    <button className="card clickable" onClick={entry.onActivate}>
      {title}
    </button>
  )
}
