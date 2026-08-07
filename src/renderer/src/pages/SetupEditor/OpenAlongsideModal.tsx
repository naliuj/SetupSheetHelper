import { useEffect, useMemo, useState } from 'react'
import type { Folder, Setup } from '@shared/types/setup'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import { buildFolderTree, flattenFolderTreeForPicker } from '@renderer/state/folderTree'
import FolderTreeNode from '@renderer/components/FolderTreeNode'

interface Props {
  /** Excluded from the list — you can't split-view a setup against itself. */
  currentSetupId: number | null
  currentSetupName: string
  /** The picked setup, in full — the caller needs its own studioId (Split View no longer assumes
   *  both panes share a studio; see SetupToolbar.tsx's onConfirm, which resolves the picked
   *  setup's buildingId from it before opening). */
  onConfirm: (setup: Setup) => void
  onClose: () => void
}

/** A single flat folder row for search results — same shape as ManageItemsModal's own
 *  FlatFolderRow, minus the CRUD actions (this is a read-only picker, not a manager). */
function FlatFolderRow({ id, name, selected, onSelect }: {
  id: number
  name: string
  selected: boolean
  onSelect: () => void
}): JSX.Element {
  return (
    <div className={`folder-tree-row ${selected ? 'selected' : ''}`} style={{ paddingLeft: 10 }}>
      <span className="folder-tree-toggle" />
      <button className="folder-tree-label tree-label" onClick={onSelect}>
        <span className="folder-tree-name">{name}</span>
      </button>
    </div>
  )
}

/** The "Split View" toolbar button's picker — same folder-tree + list layout as the "Manage
 *  setups" dialog (ManageItemsModal), reused here in read-only picker mode: browse the same
 *  folder tree, click a setup to select it, Open to confirm. No create/rename/delete/drag —
 *  those stay in Manage setups; this dialog only picks.
 *  Setups from ANY studio are listed — Split View doesn't require the two panes to share a
 *  studio (each pane loads its own gear catalogue/room-layout background off its own setup's
 *  actual studio, see SplitSetupView.tsx). Each row shows its studio name so a cross-studio pick
 *  is never ambiguous about which studio's gear list will apply. */
export default function OpenAlongsideModal({
  currentSetupId,
  currentSetupName,
  onConfirm,
  onClose
}: Props): JSX.Element {
  useEscapeToClose(onClose)
  const [folders, setFolders] = useState<Folder[]>([])
  const [setups, setSetups] = useState<Setup[]>([])
  const [studioNames, setStudioNames] = useState<Map<number, string>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [folderQuery, setFolderQuery] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([window.api.folders.list('setup'), window.api.setups.list()]).then(
      async ([folderList, setupList]) => {
        const others = setupList.filter((s) => s.id !== currentSetupId)
        setFolders(folderList)
        setSetups(others)
        const distinctStudioIds = [...new Set(others.map((s) => s.studioId))]
        const studios = await Promise.all(distinctStudioIds.map((id) => window.api.studios.get(id)))
        setStudioNames(
          new Map(studios.filter((s) => s != null).map((s) => [s!.id, s!.name]))
        )
        setLoaded(true)
      }
    )
  }, [currentSetupId])

  const tree = useMemo(() => buildFolderTree(folders), [folders])
  const showFolderSearch = folders.length > 5
  const folderQ = folderQuery.trim().toLowerCase()
  const searchMatches = folderQ
    ? flattenFolderTreeForPicker(tree).filter((o) => o.folder.name.toLowerCase().includes(folderQ))
    : []

  const itemsHere = setups.filter((s) => s.folderId === selectedFolderId)
  const q = query.trim().toLowerCase()
  const filtered = q ? itemsHere.filter((s) => s.name.toLowerCase().includes(q)) : itemsHere
  const showItemSearch = itemsHere.length > 5
  const selectedSetup = selectedId != null ? setups.find((s) => s.id === selectedId) : undefined

  function selectFolder(id: number | null): void {
    setSelectedFolderId(id)
    setQuery('')
    setSelectedId(null)
  }

  function handleConfirm(): void {
    if (selectedSetup) onConfirm(selectedSetup)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal manage-modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Open alongside &ldquo;{currentSetupName}&rdquo;</h2>

        {!loaded ? (
          <div className="card-sub">Loading…</div>
        ) : setups.length === 0 ? (
          <div className="empty-state">No other setups yet.</div>
        ) : (
          <div className="manage-layout">
            <div className="folder-tree-pane">
              {showFolderSearch && (
                <div className="folder-tree-search">
                  <input
                    placeholder="Search folders"
                    value={folderQuery}
                    onChange={(e) => setFolderQuery(e.target.value)}
                    aria-label="Search folders"
                  />
                </div>
              )}
              {folderQ ? (
                searchMatches.length > 0 ? (
                  searchMatches.map(({ folder }) => (
                    <FlatFolderRow
                      key={folder.id}
                      id={folder.id}
                      name={folder.name}
                      selected={selectedFolderId === folder.id}
                      onSelect={() => selectFolder(folder.id)}
                    />
                  ))
                ) : (
                  <div className="folder-picker-empty">No folders match &ldquo;{folderQuery}&rdquo;.</div>
                )
              ) : (
                <>
                  <div className={`folder-tree-row ${selectedFolderId === null ? 'selected' : ''}`} style={{ paddingLeft: 10 }}>
                    <span className="folder-tree-toggle" />
                    <button className="folder-tree-label" onClick={() => selectFolder(null)}>
                      (No folder)
                    </button>
                  </div>
                  {tree.map((node) => (
                    <FolderTreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      selectedFolderId={selectedFolderId}
                      onSelect={selectFolder}
                    />
                  ))}
                </>
              )}
            </div>
            <div className="manage-list-pane">
              {showItemSearch && (
                <input
                  autoFocus
                  placeholder="Search setups"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ width: '100%', marginBottom: 8 }}
                  aria-label="Search setups"
                />
              )}
              <div className="picker-menu" style={{ position: 'static' }}>
                {itemsHere.length === 0 ? (
                  <div className="empty-state">Nothing in this folder yet.</div>
                ) : filtered.length === 0 ? (
                  <div className="folder-picker-empty">No setups match &ldquo;{query}&rdquo;.</div>
                ) : (
                  filtered.map((s) => (
                    <div
                      key={s.id}
                      className={`picker-menu-row${selectedId === s.id ? ' selected' : ''}`}
                      onClick={() => setSelectedId(s.id)}
                      onDoubleClick={() => onConfirm(s)}
                    >
                      {s.name || 'Untitled Setup'}
                      {s.artist && <span className="card-sub"> — {s.artist}</span>}
                      <span className="card-sub"> · {studioNames.get(s.studioId) ?? 'Unknown studio'}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          {setups.length > 0 && (
            <button className="btn primary" onClick={handleConfirm} disabled={selectedId == null}>
              Open
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
