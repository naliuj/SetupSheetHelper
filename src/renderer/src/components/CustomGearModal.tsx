import { useState } from 'react'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

interface Props {
  /** "Mic" | "Preamp" | "Outboard" — used in the heading only. */
  kind: string
  initialValue?: string
  onClose: () => void
  onConfirm: (value: string) => void
}

/** Free-text gear entry, bypassing the studio's catalog entirely — opened from the "Custom…" row
 *  in ManufacturerPickerDropdown (mic/preamp/outboard). Single-field sibling of
 *  CustomBlockModal.tsx's shape. Re-opening on an already-custom field pre-fills the current text,
 *  so this doubles as an edit flow. */
export default function CustomGearModal({ kind, initialValue = '', onClose, onConfirm }: Props): JSX.Element {
  useEscapeToClose(onClose)
  const [value, setValue] = useState(initialValue)

  function handleConfirm(): void {
    if (!value.trim()) return
    onConfirm(value.trim())
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 320 }}>
        <h2 style={{ marginTop: 0 }}>Custom {kind}</h2>
        <input
          placeholder="Gear name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
          style={{ width: '100%', marginBottom: 8 }}
          autoFocus
          onFocus={(e) => e.target.select()}
        />
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleConfirm} disabled={!value.trim()}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
