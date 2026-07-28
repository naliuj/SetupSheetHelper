import { useEffect, useState } from 'react'
import type { Setup } from '@shared/types/setup'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

interface Props {
  studioId: number
  excludeSetupId: number
  onClose: () => void
  onAdd: (setupId: number) => Promise<void> | void
}

/** Picker for the tab strip's "Add existing setup" action — every standalone (not already grouped)
 *  setup in the Multi Setup's studio, minus the one currently open. */
export default function AddExistingSetupModal({ studioId, excludeSetupId, onClose, onAdd }: Props): JSX.Element {
  useEscapeToClose(onClose)
  const [candidates, setCandidates] = useState<Setup[] | null>(null)
  const [addingId, setAddingId] = useState<number | null>(null)

  useEffect(() => {
    window.api.setups.list(studioId).then((setups) => {
      setCandidates(setups.filter((s) => s.multiSetupId == null && s.id !== excludeSetupId))
    })
  }, [studioId, excludeSetupId])

  async function handleAdd(setupId: number): Promise<void> {
    setAddingId(setupId)
    try {
      await onAdd(setupId)
      onClose()
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <h2 style={{ marginTop: 0 }}>Add existing setup</h2>
        {candidates == null ? (
          <p className="card-sub">Loading…</p>
        ) : candidates.length === 0 ? (
          <p className="card-sub">No other standalone setups in this studio.</p>
        ) : (
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {candidates.map((setup) => (
              <div key={setup.id} className="manage-item-row">
                <span className="manage-item-label">{setup.name}</span>
                <button className="btn small" disabled={addingId === setup.id} onClick={() => handleAdd(setup.id)}>
                  {addingId === setup.id ? 'Adding…' : 'Add'}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
