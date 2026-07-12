import { useEffect, useRef, useState } from 'react'
import { useSetupStore } from '@renderer/state/setupStore'
import Icon from '@renderer/components/Icon'
import SwatchPicker from '@renderer/components/SwatchPicker'
import SaveChannelPresetModal from './SaveChannelPresetModal'

type NumberingField = 'channel' | 'tieLine' | 'cueBox'

const FIELD_LABELS: Record<NumberingField, string> = {
  channel: 'Channel',
  tieLine: 'Tie line',
  cueBox: 'Cue box'
}

/** Contextual bar for row-scoped actions — only rendered when rows are selected, so the
 *  "these act on your selection" model is always visible (unlike the old toolbar buttons that
 *  silently fell back to all rows). */
export default function SelectionActionBar(): JSX.Element | null {
  const selectedItemIds = useSetupStore((s) => s.selectedItemIds)
  const items = useSetupStore((s) => s.items)
  const applySequentialNumbering = useSetupStore((s) => s.applySequentialNumbering)
  const setItemsColor = useSetupStore((s) => s.setItemsColor)
  const removeItems = useSetupStore((s) => s.removeItems)
  const clearSelection = useSetupStore((s) => s.clearSelection)
  const numberingFocusTick = useSetupStore((s) => s.numberingFocusTick)

  const [field, setField] = useState<NumberingField>('channel')
  const [startText, setStartText] = useState('1')
  const [saveOpen, setSaveOpen] = useState(false)
  const startRef = useRef<HTMLInputElement>(null)

  // The Cmd/Ctrl+Shift+N menu item bumps numberingFocusTick to drive this inline control.
  useEffect(() => {
    if (numberingFocusTick === 0) return
    startRef.current?.focus()
    startRef.current?.select()
  }, [numberingFocusTick])

  const count = selectedItemIds.size
  // Reflect the selection's color in the swatch trigger only when every selected row shares one
  // color; a mixed selection shows the empty "no color" trigger but still applies on pick.
  const selectedColors = new Set(items.filter((i) => selectedItemIds.has(i.id)).map((i) => i.color))
  const sharedColor = selectedColors.size === 1 ? ([...selectedColors][0] ?? null) : null
  const start = Number(startText)
  const validStart = Number.isInteger(start) && startText.trim() !== '' && start >= 1

  function handleApply(): void {
    if (!validStart) return
    applySequentialNumbering(field, start)
  }

  if (count === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        margin: '10px 12px 0',
        padding: '8px 12px',
        borderRadius: 6,
        border: '1px solid var(--color-accent)',
        background: 'color-mix(in srgb, var(--color-accent) 12%, var(--color-bg))'
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
        {count} row{count === 1 ? '' : 's'} selected
      </span>

      <span style={{ width: 1, height: 20, background: 'var(--color-border)' }} />

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text)' }}>
        <Icon name="list-numbers" size={15} style={{ color: 'var(--color-text-dim)' }} />
        Number
        <select
          value={field}
          onChange={(e) => setField(e.target.value as NumberingField)}
          style={{ padding: '4px 8px', fontSize: 13 }}
        >
          {(Object.keys(FIELD_LABELS) as NumberingField[]).map((key) => (
            <option key={key} value={key}>
              {FIELD_LABELS[key]}
            </option>
          ))}
        </select>
        from
        <input
          ref={startRef}
          type="number"
          min={1}
          value={startText}
          onChange={(e) => setStartText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleApply()}
          onFocus={(e) => e.target.select()}
          style={{ width: 56, padding: '4px 8px', fontSize: 13 }}
        />
        <button className="btn small primary" onClick={handleApply} disabled={!validStart}>
          Apply
        </button>
      </span>

      <span style={{ width: 1, height: 20, background: 'var(--color-border)' }} />

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text)' }}>
        Color
        <SwatchPicker
          value={sharedColor}
          onChange={(color) => setItemsColor([...selectedItemIds], color)}
          allowNone
        />
      </span>

      <span style={{ width: 1, height: 20, background: 'var(--color-border)' }} />

      <button
        className="btn small"
        onClick={() => setSaveOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <Icon name="bookmark" size={14} /> Save as preset
      </button>
      <button
        className="btn small danger"
        onClick={() => removeItems([...selectedItemIds])}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <Icon name="trash" size={14} /> Delete
      </button>

      <span style={{ flex: 1 }} />
      <button className="btn small" onClick={clearSelection} aria-label="Clear selection">
        <Icon name="x" size={14} />
      </button>

      {saveOpen && <SaveChannelPresetModal onClose={() => setSaveOpen(false)} />}
    </div>
  )
}
