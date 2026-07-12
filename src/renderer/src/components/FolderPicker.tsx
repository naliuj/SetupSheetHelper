import { useMemo, useState } from 'react'
import type { Folder } from '@shared/types/setup'
import { buildFolderTree, flattenFolderTreeForPicker } from '@renderer/state/folderTree'

interface Props {
  folders: Folder[]
  selectedFolderId: number | null
  onSelect: (id: number | null) => void
  /** Creates a folder and returns it (already added to the caller's list). New folders land at the
   *  top level, matching the previous picker; nested creation stays in the Manage modal. */
  onCreateFolder: (name: string, parentFolderId: number | null) => Promise<Folder>
}

/** Inline folder picker: a searchable, nested list with create-in-place — replaces the old native
 *  `<select>`. Namespace-agnostic (caller supplies the folder list + create fn), so it drives
 *  studio, setup, and preset folder selection alike. */
export default function FolderPicker({
  folders,
  selectedFolderId,
  onSelect,
  onCreateFolder
}: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const options = useMemo(() => flattenFolderTreeForPicker(buildFolderTree(folders)), [folders])
  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter((o) => o.folder.name.toLowerCase().includes(q)) : options
  const showSearch = folders.length > 5

  async function confirmCreate(): Promise<void> {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const folder = await onCreateFolder(name, null)
      onSelect(folder.id)
      setNewName('')
      setCreating(false)
      setQuery('')
    } finally {
      setBusy(false)
    }
  }

  function cancelCreate(): void {
    setCreating(false)
    setNewName('')
  }

  return (
    <div className="folder-picker">
      {showSearch && (
        <div className="folder-picker-search">
          <input
            placeholder="Search folders"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search folders"
          />
        </div>
      )}
      <div className="folder-picker-list">
        {!q && (
          <button
            type="button"
            className={`folder-picker-row${selectedFolderId === null ? ' selected' : ''}`}
            onClick={() => onSelect(null)}
          >
            <span className="folder-picker-row-name folder-picker-none">No folder</span>
            {selectedFolderId === null && <span className="folder-picker-check">✓</span>}
          </button>
        )}
        {filtered.map(({ folder, depth }) => (
          <button
            key={folder.id}
            type="button"
            className={`folder-picker-row${selectedFolderId === folder.id ? ' selected' : ''}`}
            style={{ paddingLeft: 10 + (q ? 0 : depth * 16) }}
            onClick={() => onSelect(folder.id)}
          >
            <span className="folder-picker-row-name">📁 {folder.name}</span>
            {selectedFolderId === folder.id && <span className="folder-picker-check">✓</span>}
          </button>
        ))}
        {q && filtered.length === 0 && <div className="folder-picker-empty">No folders match “{query}”.</div>}
      </div>
      {creating ? (
        <div className="folder-picker-create">
          <input
            placeholder="New folder name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmCreate()
              else if (e.key === 'Escape') cancelCreate()
            }}
            autoFocus
          />
          <button type="button" className="btn small primary" onClick={confirmCreate} disabled={busy || !newName.trim()}>
            Add
          </button>
          <button type="button" className="btn small" onClick={cancelCreate}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="folder-picker-new" onClick={() => setCreating(true)}>
          + New folder…
        </button>
      )}
    </div>
  )
}
