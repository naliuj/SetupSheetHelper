import { useEffect, useMemo, useState } from 'react'
import type { SetupExportFile } from '@shared/types/ipc'
import type { Building, Studio } from '@shared/types/entities'
import { useBerkleeFeaturesStore } from '@renderer/state/berkleeFeaturesStore'

interface Props {
  file: SetupExportFile
  onBack: () => void
  onDone: () => void
}

/** Unlike studio import (which always creates its own new studio), imported setups need an
 *  existing studio to land in — so this page adds a target-studio picker before the usual
 *  per-item checklist. */
export default function SetupImportPage({ file, onBack, onDone }: Props): JSX.Element {
  const berkleeFeaturesEnabled = useBerkleeFeaturesStore((s) => s.enabled)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [berkleeStudios, setBerkleeStudios] = useState<Studio[]>([])
  const [customStudios, setCustomStudios] = useState<Studio[]>([])
  const [targetStudioId, setTargetStudioId] = useState<number | null>(null)
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    window.api.studios.listCustom().then(setCustomStudios)
  }, [])

  useEffect(() => {
    if (!berkleeFeaturesEnabled) {
      setBuildings([])
      setBerkleeStudios([])
      return
    }
    let cancelled = false
    window.api.buildings.list().then(async (list) => {
      if (cancelled) return
      setBuildings(list)
      const perBuilding = await Promise.all(list.map((b) => window.api.studios.listByBuilding(b.id)))
      if (!cancelled) setBerkleeStudios(perBuilding.flat())
    })
    return () => {
      cancelled = true
    }
  }, [berkleeFeaturesEnabled])

  const buildingNameById = useMemo(() => new Map(buildings.map((b) => [b.id, b.name])), [buildings])

  function toggle(index: number): void {
    setSelectedIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function handleImport(): Promise<void> {
    if (targetStudioId == null) return
    setImporting(true)
    setMessage(null)
    try {
      const setups = file.setups.filter((_, index) => selectedIndexes.has(index))
      await window.api.setups.importSetups(setups, targetStudioId)
      setMessage(`Imported ${setups.length} setup${setups.length === 1 ? '' : 's'}.`)
      setTimeout(onDone, 800)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <div className="nav-crumbs">
        <button onClick={onBack}>Settings</button> / Import Setups
      </div>

      <h3 style={{ marginBottom: 4 }}>Import into</h3>
      <div className="panel" style={{ maxHeight: 200, overflow: 'auto', marginBottom: 16 }}>
        {customStudios.map((studio) => (
          <label
            key={`custom-${studio.id}`}
            className="folder-tree-row"
            style={{ paddingLeft: 20, cursor: 'pointer' }}
          >
            <input
              type="radio"
              name="target-studio"
              checked={targetStudioId === studio.id}
              onChange={() => setTargetStudioId(studio.id)}
            />
            {studio.name}
          </label>
        ))}
        {berkleeStudios.map((studio) => (
          <label
            key={`berklee-${studio.id}`}
            className="folder-tree-row"
            style={{ paddingLeft: 20, cursor: 'pointer' }}
          >
            <input
              type="radio"
              name="target-studio"
              checked={targetStudioId === studio.id}
              onChange={() => setTargetStudioId(studio.id)}
            />
            {studio.name}
            {studio.buildingId != null && (
              <span className="card-sub"> ({buildingNameById.get(studio.buildingId) ?? ''})</span>
            )}
          </label>
        ))}
        {customStudios.length === 0 && berkleeStudios.length === 0 && (
          <div className="empty-state">No studios available — create one first.</div>
        )}
      </div>

      <h3 style={{ marginBottom: 4 }}>Setups to import</h3>
      <div className="inline-form" style={{ marginTop: 0 }}>
        <button className="btn small" onClick={() => setSelectedIndexes(new Set(file.setups.map((_, i) => i)))}>
          Select all
        </button>
        <button className="btn small" onClick={() => setSelectedIndexes(new Set())}>
          Deselect all
        </button>
      </div>
      <div className="panel" style={{ maxHeight: 320, overflow: 'auto' }}>
        {file.setups.map((setup, index) => (
          <label key={index} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
            <input type="checkbox" checked={selectedIndexes.has(index)} onChange={() => toggle(index)} />
            {setup.name}
            <span className="card-sub">
              ({setup.items.length} item{setup.items.length === 1 ? '' : 's'}
              {setup.layoutOverride ? ', layout included' : ''})
            </span>
          </label>
        ))}
      </div>
      {message && <p className="card-sub">{message}</p>}
      <div className="modal-actions">
        <button
          className="btn primary"
          onClick={handleImport}
          disabled={importing || selectedIndexes.size === 0 || targetStudioId == null}
        >
          {importing ? 'Importing…' : 'Import Selected'}
        </button>
      </div>
    </div>
  )
}
