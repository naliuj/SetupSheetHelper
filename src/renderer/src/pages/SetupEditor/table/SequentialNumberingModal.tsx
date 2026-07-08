import { useState } from 'react'
import { useSetupStore } from '@renderer/state/setupStore'

type NumberingField = 'channel' | 'tieLine' | 'cueBox'

const FIELD_LABELS: Record<NumberingField, string> = {
  channel: 'Channel',
  tieLine: 'Tie Line',
  cueBox: 'Cue Box'
}

/** Fill-series prompt for Table Mode: pick a field and a starting number, and the selected
 *  rows (or every row, when nothing is selected) get numbered sequentially in row order.
 *  The selection determines the count — only the start is asked, spreadsheet-style. */
export default function SequentialNumberingModal({ onClose }: { onClose: () => void }): JSX.Element {
  const items = useSetupStore((s) => s.items)
  const selectedItemIds = useSetupStore((s) => s.selectedItemIds)
  const applySequentialNumbering = useSetupStore((s) => s.applySequentialNumbering)

  const [field, setField] = useState<NumberingField>('channel')
  const [startText, setStartText] = useState('1')

  const targetCount = selectedItemIds.size > 0 ? selectedItemIds.size : items.length
  const start = Number(startText)
  const validStart = Number.isInteger(start) && startText.trim() !== ''
  const preview =
    targetCount === 0
      ? 'No rows to number.'
      : `${selectedItemIds.size > 0 ? `${targetCount} selected row${targetCount === 1 ? '' : 's'}` : `All ${targetCount} row${targetCount === 1 ? '' : 's'}`}${validStart ? ` → ${start}–${start + targetCount - 1}` : ''}`

  function handleConfirm(): void {
    if (!validStart || targetCount === 0) return
    applySequentialNumbering(field, start)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 340 }}>
        <h2 style={{ marginTop: 0 }}>Sequential Numbering</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          Field
          <select value={field} onChange={(e) => setField(e.target.value as NumberingField)}>
            {(Object.keys(FIELD_LABELS) as NumberingField[]).map((key) => (
              <option key={key} value={key}>
                {FIELD_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          Starting number
          <input
            type="number"
            value={startText}
            onChange={(e) => setStartText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            style={{ width: 80 }}
            autoFocus
            onFocus={(e) => e.target.select()}
          />
        </label>
        <p className="card-sub">{preview}</p>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleConfirm} disabled={!validStart || targetCount === 0}>
            Fill
          </button>
        </div>
      </div>
    </div>
  )
}
