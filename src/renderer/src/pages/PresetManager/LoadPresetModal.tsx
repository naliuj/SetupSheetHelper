import { useEffect, useMemo, useState } from 'react'
import type { ChannelPreset } from '@shared/types/channelPreset'
import type { Folder } from '@shared/types/setup'
import { useCatalogStoreState } from '@renderer/state/catalogStoreContext'
import { useSetupStoreState } from '@renderer/state/setupStoreContext'
import { resolveChannelPresetItems } from '@renderer/state/channelPresetResolution'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import { buildFolderTree, flattenFolderTreeForPicker } from '@renderer/state/folderTree'
import FolderTreeNode from '@renderer/components/FolderTreeNode'

/** A single flat folder row for search results — read-only, so no CRUD actions. Mirrors
 *  OpenAlongsideModal's row of the same name. */
function FlatFolderRow({
  name,
  selected,
  onSelect
}: {
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

/** The Presets toolbar menu's "Load preset…" picker — the same folder-tree + list layout as
 *  "Manage setups"/"Manage presets", in read-only picker mode: browse the folder tree, click a
 *  preset to select it, Load to apply. Previously a lone native <select> that ignored folderId
 *  entirely, so presets the user had carefully filed were indistinguishable in one flat list. */
export default function LoadPresetModal({ onClose }: { onClose: () => void }): JSX.Element {
  useEscapeToClose(onClose)
  const mics = useCatalogStoreState((s) => s.mics)
  const outboardGear = useCatalogStoreState((s) => s.outboardGear)
  const preamps = useCatalogStoreState((s) => s.preamps)
  const applyChannelPreset = useSetupStoreState((s) => s.applyChannelPreset)

  const [folders, setFolders] = useState<Folder[]>([])
  const [presets, setPresets] = useState<ChannelPreset[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [folderQuery, setFolderQuery] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([window.api.presetFolders.list(), window.api.presets.list()]).then(
      ([folderList, presetList]) => {
        setFolders(folderList)
        setPresets(presetList)
        setLoaded(true)
      }
    )
  }, [])

  const tree = useMemo(() => buildFolderTree(folders), [folders])
  const showFolderSearch = folders.length > 5
  const folderQ = folderQuery.trim().toLowerCase()
  const searchMatches = folderQ
    ? flattenFolderTreeForPicker(tree).filter((o) => o.folder.name.toLowerCase().includes(folderQ))
    : []

  const itemsHere = presets.filter((p) => p.folderId === selectedFolderId)
  const q = query.trim().toLowerCase()
  const filtered = q ? itemsHere.filter((p) => p.name.toLowerCase().includes(q)) : itemsHere
  const showItemSearch = itemsHere.length > 5

  function selectFolder(id: number | null): void {
    setSelectedFolderId(id)
    setQuery('')
    setSelectedId(null)
  }

  async function loadPreset(id: number): Promise<void> {
    const preset = await window.api.presets.getWithItems(id)
    if (!preset) return
    const resolved = resolveChannelPresetItems(preset.items, mics, outboardGear, preamps)
    applyChannelPreset(resolved)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal manage-modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Load channel preset</h2>

        {!loaded ? (
          <div className="card-sub">Loading…</div>
        ) : presets.length === 0 ? (
          <div className="empty-state">No channel presets saved yet — save one from an open setup.</div>
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
                  <div
                    className={`folder-tree-row ${selectedFolderId === null ? 'selected' : ''}`}
                    style={{ paddingLeft: 10 }}
                  >
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
                  placeholder="Search presets"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ width: '100%', marginBottom: 8 }}
                  aria-label="Search presets"
                />
              )}
              <div className="picker-menu" style={{ position: 'static' }}>
                {itemsHere.length === 0 ? (
                  <div className="empty-state">Nothing in this folder yet.</div>
                ) : filtered.length === 0 ? (
                  <div className="folder-picker-empty">No presets match &ldquo;{query}&rdquo;.</div>
                ) : (
                  filtered.map((p) => (
                    <div
                      key={p.id}
                      className={`picker-menu-row${selectedId === p.id ? ' selected' : ''}`}
                      onClick={() => setSelectedId(p.id)}
                      onDoubleClick={() => loadPreset(p.id)}
                    >
                      {p.name}
                      {p.description && <span className="card-sub"> — {p.description}</span>}
                    </div>
                  ))
                )}
              </div>
              <p className="card-sub" style={{ marginTop: 8 }}>
                Rows are added to the current setup. Any mic or outboard not found in this studio&rsquo;s catalogue is
                still added — unassigned, with a warning badge — so you can pick a replacement right in the table.
              </p>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          {presets.length > 0 && (
            <button
              className="btn primary"
              onClick={() => selectedId != null && loadPreset(selectedId)}
              disabled={selectedId == null}
            >
              Load
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
