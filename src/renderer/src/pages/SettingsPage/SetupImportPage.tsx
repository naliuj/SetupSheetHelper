import { useEffect, useMemo, useState } from 'react'
import type { ExportedPatchbaySource, SetupExportFile } from '@shared/types/ipc'
import type { Building, Studio } from '@shared/types/entities'
import type { PatchbayFile } from '@shared/types/patchbay'
import { useBerkleeFeaturesStore } from '@renderer/state/berkleeFeaturesStore'

interface Props {
  file: SetupExportFile
  onBack: () => void
  onDone: (imported: string[]) => void
}

/** Within a point either way counts as the same drawing; page sizes round-trip through floats. */
function samePage(source: ExportedPatchbaySource, drawing: PatchbayFile): boolean {
  return (
    Math.abs(source.pageWidthPt - drawing.pageWidthPt) < 1 &&
    Math.abs(source.pageHeightPt - drawing.pageHeightPt) < 1
  )
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
  // The target studio's patchbay drawing: undefined until it's known, null when it has none.
  const [targetPatchbay, setTargetPatchbay] = useState<PatchbayFile | null | undefined>(undefined)
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    setTargetPatchbay(undefined)
    if (targetStudioId == null) return
    let cancelled = false
    window.api.patchbay.getForStudio(targetStudioId).then((patchbay) => {
      if (!cancelled) setTargetPatchbay(patchbay?.file ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [targetStudioId])

  const buildingNameById = useMemo(() => new Map(buildings.map((b) => [b.id, b.name])), [buildings])

  function toggle(index: number): void {
    setSelectedIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const selectedWithCables = file.setups.filter(
    (setup, index) => selectedIndexes.has(index) && (setup.patchCables?.length ?? 0) > 0
  )
  const drawnElsewhere = targetPatchbay
    ? selectedWithCables.filter((setup) => setup.patchbaySource && !samePage(setup.patchbaySource, targetPatchbay))
    : []

  async function handleImport(): Promise<void> {
    if (targetStudioId == null) return
    setImporting(true)
    setError(null)
    try {
      const setups = file.setups.filter((_, index) => selectedIndexes.has(index))
      await window.api.setups.importSetups(setups, targetStudioId)
      onDone(setups.map((setup) => setup.name))
    } catch {
      // Previously a try/finally with no catch, so a failed write left the page silent.
      setError('Could not import from that file. Nothing was changed.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="page">
      <div className="nav-crumbs">
        <button onClick={onBack}>Settings</button> / Import setups
      </div>

      <h2 style={{ margin: '8px 0 12px' }}>Import setups</h2>

      <div className="section-title" style={{ marginTop: 0 }}>
        Import into
      </div>
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
            <span className="folder-tree-name" title={studio.name}>
              {studio.name}
            </span>
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
            <span className="folder-tree-name" title={studio.name}>
              {studio.name}
            </span>
            {studio.buildingId != null && (
              <span className="card-sub no-shrink"> ({buildingNameById.get(studio.buildingId) ?? ''})</span>
            )}
          </label>
        ))}
        {customStudios.length === 0 && berkleeStudios.length === 0 && (
          <div className="empty-state">No studios available — create one first.</div>
        )}
      </div>

      <div className="section-title">Setups to import</div>
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
            <span className="truncate" title={setup.name}>
              {setup.name}
            </span>
            <span className="card-sub no-shrink">
              ({setup.items.length} item{setup.items.length === 1 ? '' : 's'}
              {setup.layoutOverride ? ', layout included' : ''}
              {setup.patchCables?.length
                ? `, ${setup.patchCables.length} cable${setup.patchCables.length === 1 ? '' : 's'}`
                : ''}
              )
            </span>
          </label>
        ))}
      </div>
      {selectedWithCables.length > 0 && targetPatchbay === null && (
        <p className="card-sub">
          This studio has no patchbay drawing, so the cables won&apos;t show yet. They&apos;ll appear once one is
          uploaded.
        </p>
      )}
      {drawnElsewhere.length > 0 && (
        <p className="card-sub" style={{ color: 'var(--color-warning)' }}>
          The cables in{' '}
          {drawnElsewhere.length === 1 ? `“${drawnElsewhere[0].name}”` : `${drawnElsewhere.length} of these setups`}{' '}
          were drawn on a different patchbay, so they may not line up.
        </p>
      )}
      {error && (
        <p className="card-sub" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="btn" onClick={onBack}>
          Back
        </button>
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
