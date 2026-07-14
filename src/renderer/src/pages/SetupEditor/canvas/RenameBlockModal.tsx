import { useState } from 'react'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

interface Props {
  initialLabel: string
  initialPersonName: string | null
  onClose: () => void
  onConfirm: (label: string, personName: string | null) => void
}

export default function RenameBlockModal({
  initialLabel,
  initialPersonName,
  onClose,
  onConfirm
}: Props): JSX.Element {
  useEscapeToClose(onClose)
  const [label, setLabel] = useState(initialLabel)
  const [personName, setPersonName] = useState(initialPersonName ?? '')

  function handleConfirm(): void {
    if (!label.trim()) return
    onConfirm(label.trim(), personName.trim() || null)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 320 }}>
        <h2 style={{ marginTop: 0 }}>Rename block</h2>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
          style={{ width: '100%' }}
          autoFocus
          onFocus={(e) => e.target.select()}
        />
        <label className="card-sub" style={{ display: 'block', marginTop: 12, marginBottom: 4 }}>
          Musician name (optional)
        </label>
        <input
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
          placeholder="e.g. Maria K."
          style={{ width: '100%' }}
        />
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleConfirm} disabled={!label.trim()}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
