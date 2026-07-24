import { useState } from 'react'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import { DEFAULT_SWATCH } from '@shared/constants/swatches'
import SwatchPicker from '@renderer/components/SwatchPicker'

interface Props {
  initialTitle?: string
  initialColor?: string
  initialPersonName?: string | null
  heading?: string
  description?: string | null
  confirmLabel?: string
  onClose: () => void
  onConfirm: (title: string, color: string, personName: string | null) => void
}

const DEFAULT_COLOR = DEFAULT_SWATCH

/** Title/color/musician-name form, shared by one-off custom block creation (canvas "Add
 *  Instrument" and the sidebar's "+ Add custom block") and editing an existing block (Layout
 *  Mode's right-click "Edit") — same dialogue either way, just seeded with the block's current
 *  values and a different heading/confirm label. Confirming a fresh one places a block directly
 *  on the canvas; nothing gets added to the palette/sidebar. */
export default function CustomBlockModal({
  initialTitle = '',
  initialColor = DEFAULT_COLOR,
  initialPersonName = '',
  heading = 'Add custom block',
  description = 'Placed directly on the layout — not added to the sidebar.',
  confirmLabel = 'Add block',
  onClose,
  onConfirm
}: Props): JSX.Element {
  useEscapeToClose(onClose)
  const [title, setTitle] = useState(initialTitle)
  const [color, setColor] = useState(initialColor)
  const [personName, setPersonName] = useState(initialPersonName ?? '')

  function handleConfirm(): void {
    if (!title.trim()) return
    onConfirm(title.trim(), color, personName.trim() || null)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 320 }}>
        <h2 style={{ marginTop: 0 }}>{heading}</h2>
        {description && (
          <p className="card-sub" style={{ marginTop: 0 }}>
            {description}
          </p>
        )}
        <input
          placeholder="Title (e.g. Cello, Conductor)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
          style={{ width: '100%', marginBottom: 8 }}
          autoFocus
          onFocus={(e) => e.target.select()}
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
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
