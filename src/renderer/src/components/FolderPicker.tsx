import { useMemo, useState } from 'react'
import { Check, Folder, Plus } from 'lucide-react'
import type { Folder as FolderType } from '@shared/types/setup'
import { buildFolderTree, flattenFolderTreeForPicker } from '@renderer/state/folderTree'

interface Props {
  folders: FolderType[]
  selectedFolderId: number | null
  onSelect: (id: number | null) => void
  /** Creates a folder under `parentFolderId` (null = top level) and returns it (already added to
   *  the caller's list). */
  onCreateFolder: (name: string, parentFolderId: number | null) => Promise<FolderType>
}

/** Inline folder picker: a searchable, nested list with create-in-place — replaces the old native
 *  `<select>`. Namespace-agnostic (caller supplies the folder list + create fn), so it drives
 *  studio, setup, and preset folder selection alike. New folders can be created at the top level
 *  (the bottom row) or nested under any folder (its hover "+" action). */
export default function FolderPicker({
  folders,
  selectedFolderId,
  onSelect,
  onCreateFolder
}: Props): JSX.Element {
  const [query, setQuery] = useState('')
  // null = not creating; otherwise the parent the new folder will be created under (null = root).
  const [createTarget, setCreateTarget] = useState<{ parentId: number | null } | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const options = useMemo(() => flattenFolderTreeForPicker(buildFolderTree(folders)), [folders])
  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter((o) => o.folder.name.toLowerCase().includes(q)) : options
  const showSearch = folders.length > 5
  const parentName =
    createTarget && createTarget.parentId != null
      ? folders.find((f) => f.id === createTarget.parentId)?.name ?? null
      : null

  async function confirmCreate(): Promise<void> {
    const name = newName.trim()
    if (!name || busy || !createTarget) return
    setBusy(true)
    try {
      const folder = await onCreateFolder(name, createTarget.parentId)
      onSelect(folder.id)
      setNewName('')
      setCreateTarget(null)
      setQuery('')
    } finally {
      setBusy(false)
    }
  }

  function cancelCreate(): void {
    setCreateTarget(null)
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
          <div className={`folder-picker-row${selectedFolderId === null ? ' selected' : ''}`}>
            <button type="button" className="folder-picker-select folder-picker-none" onClick={() => onSelect(null)}>
              No folder
            </button>
            {selectedFolderId === null && <Check className="folder-picker-check" size={15} aria-hidden="true" />}
          </div>
        )}
        {filtered.map(({ folder, depth }) => (
          <div
            key={folder.id}
            className={`folder-picker-row${selectedFolderId === folder.id ? ' selected' : ''}`}
            style={{ paddingLeft: 10 + (q ? 0 : depth * 16) }}
          >
            <button type="button" className="folder-picker-select tree-label" onClick={() => onSelect(folder.id)}>
              <Folder className="home-icon" size={15} aria-hidden="true" />
              <span className="folder-tree-name">{folder.name}</span>
            </button>
            <button
              type="button"
              className="folder-picker-subfolder"
              title="New subfolder"
              aria-label={`New subfolder in ${folder.name}`}
              onClick={() => {
                setNewName('')
                setCreateTarget({ parentId: folder.id })
              }}
            >
              <Plus size={15} aria-hidden="true" />
            </button>
            {selectedFolderId === folder.id && <Check className="folder-picker-check" size={15} aria-hidden="true" />}
          </div>
        ))}
        {q && filtered.length === 0 && <div className="folder-picker-empty">No folders match “{query}”.</div>}
      </div>
      {createTarget ? (
        <div className="folder-picker-create">
          <input
            placeholder={parentName ? `New subfolder in ${parentName}` : 'New folder name'}
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
        <button type="button" className="folder-picker-new" onClick={() => setCreateTarget({ parentId: null })}>
          + New folder…
        </button>
      )}
    </div>
  )
}
