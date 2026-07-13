import { useEffect, useMemo, useState } from 'react'
import { Building2, ChevronDown, ChevronRight, Folder } from 'lucide-react'
import type { Building, MicWithStudio, OutboardGearWithStudio, Studio } from '@shared/types/entities'
import type { Folder as FolderType, FolderTreeNode as FolderTreeNodeType } from '@shared/types/setup'
import { buildFolderTree } from '@renderer/state/folderTree'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

interface Props {
  allMics: MicWithStudio[]
  allOutboard: OutboardGearWithStudio[]
  currentStudioId: number | null
  onImport: (micIds: number[], outboardIds: number[]) => void
  onClose: () => void
}

/** Recursive folder branch for the source-studio picker — single-select (highlights the chosen
 *  studio) rather than the checkbox multi-select the export tree uses. */
function StudioPickerFolderNode({
  node,
  depth,
  studiosByFolder,
  selectedId,
  onSelect
}: {
  node: FolderTreeNodeType
  depth: number
  studiosByFolder: Map<number | null, Studio[]>
  selectedId: number | null
  onSelect: (id: number) => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const studiosHere = studiosByFolder.get(node.id) ?? []
  const hasContent = node.children.length > 0 || studiosHere.length > 0

  return (
    <div>
      <div className="folder-tree-row" style={{ paddingLeft: depth * 16 }}>
        {hasContent ? (
          <button className="folder-tree-toggle" onClick={() => setExpanded((e) => !e)}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="folder-tree-toggle" />
        )}
        <span className="folder-tree-label tree-label">
          <Folder className="home-icon" size={15} aria-hidden="true" />
          <span className="folder-tree-name">{node.name}</span>
        </span>
      </div>
      {expanded && (
        <>
          {studiosHere.map((studio) => (
            <div
              key={studio.id}
              className={`folder-tree-row ${selectedId === studio.id ? 'selected' : ''}`}
              style={{ paddingLeft: (depth + 1) * 16 + 20, cursor: 'pointer' }}
              onClick={() => onSelect(studio.id)}
            >
              {studio.name}
            </div>
          ))}
          {node.children.map((child) => (
            <StudioPickerFolderNode
              key={child.id}
              node={child}
              depth={depth + 1}
              studiosByFolder={studiosByFolder}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </>
      )}
    </div>
  )
}

/** Lets the user pick a source studio, then cherry-pick which of its mic-locker and outboard-locker
 *  items to import — for fast creation of a new studio with a similar gear list. Imported items are
 *  handed back as plain id lists; the parent pushes them into its existing pending-gear state the
 *  same way manual entry and the catalogue picker already do. */
export default function ImportGearModal({
  allMics,
  allOutboard,
  currentStudioId,
  onImport,
  onClose
}: Props): JSX.Element {
  useEscapeToClose(onClose)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [buildingStudios, setBuildingStudios] = useState<Studio[]>([])
  const [customStudios, setCustomStudios] = useState<Studio[]>([])
  const [folders, setFolders] = useState<FolderType[]>([])

  useEffect(() => {
    window.api.folders.list('studio').then(setFolders)
    window.api.studios.listCustom().then(setCustomStudios)
    window.api.buildings.list().then(async (list) => {
      setBuildings(list)
      const perBuilding = await Promise.all(list.map((b) => window.api.studios.listByBuilding(b.id)))
      setBuildingStudios(perBuilding.flat())
    })
  }, [])

  const tree = useMemo(() => buildFolderTree(folders), [folders])
  const studiosByFolder = useMemo(() => {
    const map = new Map<number | null, Studio[]>()
    for (const studio of customStudios) {
      if (studio.id === currentStudioId) continue
      const list = map.get(studio.folderId) ?? []
      list.push(studio)
      map.set(studio.folderId, list)
    }
    return map
  }, [customStudios, currentStudioId])
  const unfiledCustomStudios = studiosByFolder.get(null) ?? []

  const buildingGroups = useMemo(
    () =>
      buildings
        .map((building) => ({
          building,
          studios: buildingStudios.filter((s) => s.buildingId === building.id && s.id !== currentStudioId)
        }))
        .filter((g) => g.studios.length > 0),
    [buildings, buildingStudios, currentStudioId]
  )

  const [sourceStudioId, setSourceStudioId] = useState<number | null>(null)
  const [selectedMicIds, setSelectedMicIds] = useState<Set<number>>(new Set())
  const [selectedOutboardIds, setSelectedOutboardIds] = useState<Set<number>>(new Set())

  const micsHere = useMemo(
    () => allMics.filter((m) => m.studioId === sourceStudioId),
    [allMics, sourceStudioId]
  )
  const outboardHere = useMemo(
    () => allOutboard.filter((o) => o.studioId === sourceStudioId),
    [allOutboard, sourceStudioId]
  )

  // Default to importing the whole locker — "similar gear list" implies most/all of it, with
  // occasional exclusions rather than starting from nothing.
  useEffect(() => {
    setSelectedMicIds(new Set(micsHere.map((m) => m.id)))
    setSelectedOutboardIds(new Set(outboardHere.map((o) => o.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceStudioId])

  function toggleMic(id: number): void {
    setSelectedMicIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleOutboard(id: number): void {
    setSelectedOutboardIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleImport(): void {
    onImport([...selectedMicIds], [...selectedOutboardIds])
    onClose()
  }

  const noStudiosAvailable = buildingGroups.length === 0 && customStudios.length === 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 480, maxHeight: '80vh', overflow: 'auto' }}
      >
        <h2 style={{ marginTop: 0 }}>Import gear from another studio</h2>

        <div className="panel" style={{ maxHeight: 220, overflow: 'auto', marginBottom: 12 }}>
          {buildingGroups.map(({ building, studios }) => (
            <div key={building.id}>
              <div className="folder-tree-row">
                <span className="folder-tree-toggle" />
                <span className="folder-tree-label tree-label">
                  <Building2 className="home-icon" size={15} aria-hidden="true" />
                  <span className="folder-tree-name">{building.name}</span>
                </span>
              </div>
              {studios.map((studio) => (
                <div
                  key={studio.id}
                  className={`folder-tree-row ${sourceStudioId === studio.id ? 'selected' : ''}`}
                  style={{ paddingLeft: 36, cursor: 'pointer' }}
                  onClick={() => setSourceStudioId(studio.id)}
                >
                  {studio.name}
                </div>
              ))}
            </div>
          ))}
          {unfiledCustomStudios.map((studio) => (
            <div
              key={studio.id}
              className={`folder-tree-row ${sourceStudioId === studio.id ? 'selected' : ''}`}
              style={{ paddingLeft: 20, cursor: 'pointer' }}
              onClick={() => setSourceStudioId(studio.id)}
            >
              {studio.name}
            </div>
          ))}
          {tree.map((node) => (
            <StudioPickerFolderNode
              key={node.id}
              node={node}
              depth={0}
              studiosByFolder={studiosByFolder}
              selectedId={sourceStudioId}
              onSelect={setSourceStudioId}
            />
          ))}
          {noStudiosAvailable && <div className="empty-state">No other studios available.</div>}
        </div>

        {sourceStudioId != null && (
          <>
            <div className="section-title">
              Mic locker
              <span className="card-sub" style={{ float: 'right', fontWeight: 400 }}>
                <button className="btn small" onClick={() => setSelectedMicIds(new Set(micsHere.map((m) => m.id)))}>
                  All
                </button>{' '}
                <button className="btn small" onClick={() => setSelectedMicIds(new Set())}>
                  None
                </button>
              </span>
            </div>
            {micsHere.length === 0 ? (
              <div className="empty-state">No mics in this studio.</div>
            ) : (
              <div className="panel" style={{ maxHeight: 160, overflow: 'auto' }}>
                {micsHere.map((mic) => (
                  <label key={mic.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                    <input type="checkbox" checked={selectedMicIds.has(mic.id)} onChange={() => toggleMic(mic.id)} />
                    {mic.manufacturer ? `${mic.manufacturer} ` : ''}
                    {mic.name}
                    {mic.quantity > 1 ? ` (x${mic.quantity})` : ''}
                  </label>
                ))}
              </div>
            )}

            <div className="section-title">
              Outboard gear
              <span className="card-sub" style={{ float: 'right', fontWeight: 400 }}>
                <button
                  className="btn small"
                  onClick={() => setSelectedOutboardIds(new Set(outboardHere.map((o) => o.id)))}
                >
                  All
                </button>{' '}
                <button className="btn small" onClick={() => setSelectedOutboardIds(new Set())}>
                  None
                </button>
              </span>
            </div>
            {outboardHere.length === 0 ? (
              <div className="empty-state">No outboard gear in this studio.</div>
            ) : (
              <div className="panel" style={{ maxHeight: 160, overflow: 'auto' }}>
                {outboardHere.map((gear) => (
                  <label key={gear.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                    <input
                      type="checkbox"
                      checked={selectedOutboardIds.has(gear.id)}
                      onChange={() => toggleOutboard(gear.id)}
                    />
                    {gear.manufacturer ? `${gear.manufacturer} ` : ''}
                    {gear.name}
                    {gear.quantity > 1 ? ` (x${gear.quantity})` : ''}
                  </label>
                ))}
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={handleImport}
            disabled={sourceStudioId == null || (selectedMicIds.size === 0 && selectedOutboardIds.size === 0)}
            title={
              sourceStudioId == null
                ? 'Choose a studio to import from'
                : selectedMicIds.size === 0 && selectedOutboardIds.size === 0
                  ? 'Select at least one item to import'
                  : undefined
            }
          >
            Import selected
          </button>
        </div>
      </div>
    </div>
  )
}
