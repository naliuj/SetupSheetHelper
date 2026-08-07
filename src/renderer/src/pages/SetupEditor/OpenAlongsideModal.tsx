import { useEffect, useState } from 'react'
import type { Setup } from '@shared/types/setup'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

interface Props {
  studioId: number
  /** Excluded from the list — you can't split-view a setup against itself. */
  currentSetupId: number | null
  currentSetupName: string
  onConfirm: (setupId: number) => void
  onClose: () => void
}

/** The "Split View" toolbar button's picker — modeled on LoadPresetModal.tsx's overall shape
 *  (fetch-on-mount, Cancel/primary footer) and FolderPicker.tsx's search/filter interaction.
 *  Scoped to setups in the SAME studio, matching the existing dual-monitor pop-out window's own
 *  same-studio assumption (gear/catalogue data is studio-scoped) — cross-studio picking would
 *  need a new list/search IPC, not added here. */
export default function OpenAlongsideModal({
  studioId,
  currentSetupId,
  currentSetupName,
  onConfirm,
  onClose
}: Props): JSX.Element {
  useEscapeToClose(onClose)
  const [setups, setSetups] = useState<Setup[]>([])
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    window.api.setups.list(studioId).then((list) => {
      const others = list.filter((s) => s.id !== currentSetupId)
      setSetups(others)
      setLoaded(true)
    })
  }, [studioId, currentSetupId])

  const q = query.trim().toLowerCase()
  const filtered = q ? setups.filter((s) => s.name.toLowerCase().includes(q)) : setups
  const showSearch = setups.length > 5

  function handleConfirm(): void {
    if (selectedId == null) return
    onConfirm(selectedId)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <h2 style={{ marginTop: 0 }}>Open alongside &ldquo;{currentSetupName}&rdquo;</h2>

        {!loaded ? (
          <div className="card-sub">Loading…</div>
        ) : setups.length === 0 ? (
          <div className="empty-state">No other setups in this studio yet.</div>
        ) : (
          <>
            {showSearch && (
              <input
                autoFocus
                placeholder="Search setups"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: '100%', marginBottom: 8 }}
                aria-label="Search setups"
              />
            )}
            <div className="picker-menu" style={{ position: 'static', maxHeight: 280, overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div className="folder-picker-empty">No setups match &ldquo;{query}&rdquo;.</div>
              ) : (
                filtered.map((s) => (
                  <div
                    key={s.id}
                    className={`picker-menu-row${selectedId === s.id ? ' selected' : ''}`}
                    onClick={() => setSelectedId(s.id)}
                    onDoubleClick={() => onConfirm(s.id)}
                  >
                    {s.name || 'Untitled Setup'}
                    {s.artist && <span className="card-sub"> — {s.artist}</span>}
                  </div>
                ))
              )}
            </div>
          </>
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
