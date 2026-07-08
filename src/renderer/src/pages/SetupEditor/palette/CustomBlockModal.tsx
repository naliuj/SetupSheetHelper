import { useState } from 'react'

interface Props {
  onClose: () => void
  onConfirm: (title: string, color: string) => void
}

const DEFAULT_COLOR = '#6c7ba0'

/** One-off custom block creation — title and color only, per design. Confirming places a
 *  single block directly on the canvas; nothing gets added to the palette/sidebar. */
export default function CustomBlockModal({ onClose, onConfirm }: Props): JSX.Element {
  const [title, setTitle] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)

  function handleConfirm(): void {
    if (!title.trim()) return
    onConfirm(title.trim(), color)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 320 }}>
        <h2 style={{ marginTop: 0 }}>Add Custom Block</h2>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          Color
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleConfirm} disabled={!title.trim()}>
            Add Block
          </button>
        </div>
      </div>
    </div>
  )
}
