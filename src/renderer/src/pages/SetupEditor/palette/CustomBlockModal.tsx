import { useState } from 'react'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import { DEFAULT_SWATCH } from '@shared/constants/swatches'
import SwatchPicker from '@renderer/components/SwatchPicker'

interface Props {
  onClose: () => void
  onConfirm: (title: string, color: string, personName: string | null) => void
}

const DEFAULT_COLOR = DEFAULT_SWATCH

/** One-off custom block creation — title, color, and optional musician name, per design.
 *  Confirming places a single block directly on the canvas; nothing gets added to the
 *  palette/sidebar. */
export default function CustomBlockModal({ onClose, onConfirm }: Props): JSX.Element {
  useEscapeToClose(onClose)
  const [title, setTitle] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [personName, setPersonName] = useState('')

  function handleConfirm(): void {
    if (!title.trim()) return
    onConfirm(title.trim(), color, personName.trim() || null)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 320 }}>
        <h2 style={{ marginTop: 0 }}>Add custom block</h2>
        <p className="card-sub" style={{ marginTop: 0 }}>
          Placed directly on the layout — not added to the sidebar.
        </p>
        <input
          placeholder="Title (e.g. Cello, Conductor)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
          style={{ width: '100%', marginBottom: 8 }}
          autoFocus
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          Color
          <SwatchPicker value={color} onChange={(c) => setColor(c ?? DEFAULT_COLOR)} />
        </div>
        <label className="card-sub" style={{ display: 'block', marginBottom: 4 }}>
          Musician name (optional)
        </label>
        <input
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
          placeholder="e.g. Maria K."
          style={{ width: '100%', marginBottom: 8 }}
        />
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleConfirm} disabled={!title.trim()}>
            Add block
          </button>
        </div>
      </div>
    </div>
  )
}
