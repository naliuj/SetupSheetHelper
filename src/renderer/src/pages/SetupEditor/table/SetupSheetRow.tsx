import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SetupItemDraft, SetupItemOutboardSlot } from '@shared/types/setup'
import type { Mic, OutboardGear, Preamp } from '@shared/types/entities'
import type { UnresolvedGearHint } from '@renderer/state/setupStore'
import ManufacturerPickerDropdown from '@renderer/components/ManufacturerPickerDropdown'
import { applyMicPoolNotesTag } from '@renderer/state/micPoolNotesTag'
import { useBufferedField } from './useBufferedField'

const POOL_LABELS: Record<Mic['poolType'], string> = {
  studio: 'This Studio',
  setup: 'This Session',
  building: 'Building Office',
  faculty_reserve: 'Faculty Reserve',
  personal: 'Personal Gear Locker'
}
const POOL_ORDER = [
  POOL_LABELS.studio,
  POOL_LABELS.setup,
  POOL_LABELS.building,
  POOL_LABELS.personal,
  POOL_LABELS.faculty_reserve
]

const PREAMP_POOL_LABELS: Record<Preamp['poolType'], string> = {
  studio: 'This Studio',
  setup: 'This Session',
  building: 'Building Office',
  faculty_reserve: 'Faculty Reserve',
  personal: 'Personal Gear Locker'
}
const PREAMP_POOL_ORDER = [
  PREAMP_POOL_LABELS.studio,
  PREAMP_POOL_LABELS.setup,
  PREAMP_POOL_LABELS.building,
  PREAMP_POOL_LABELS.personal,
  PREAMP_POOL_LABELS.faculty_reserve
]

// A single Outboard column's cell. Extracted as its own component (rather than an inline
// loop body) because each slot needs its own independent useBufferedField hook instance, and
// hooks can't be called a variable number of times inside a plain loop (Rules of Hooks).
function OutboardSlotCell({
  slotIndex,
  slot,
  isTemporary,
  outboardGear,
  outboardSuggestions,
  outboardUsageCounts,
  itemId,
  hintText,
  onSlotChange
}: {
  slotIndex: number
  slot: SetupItemOutboardSlot | undefined
  isTemporary: boolean
  outboardGear: OutboardGear[]
  outboardSuggestions: string[]
  outboardUsageCounts: Map<number, number>
  itemId: number | string
  hintText: string | undefined
  onSlotChange: (patch: Partial<Pick<SetupItemOutboardSlot, 'outboardId' | 'outboardText'>>) => void
}): JSX.Element {
  const outboardText = useBufferedField(slot?.outboardText ?? '', (v) => onSlotChange({ outboardText: v }))

  return (
    <td onClick={(e) => e.stopPropagation()}>
      {isTemporary ? (
        <>
          <input
            value={outboardText.value}
            placeholder="Outboard"
            onChange={(e) => outboardText.onChange(e.target.value)}
            onBlur={outboardText.onBlur}
            onClick={(e) => e.stopPropagation()}
            list={`outboard-suggestions-${itemId}-${slotIndex}`}
          />
          <datalist id={`outboard-suggestions-${itemId}-${slotIndex}`}>
            {outboardSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </>
      ) : (
        <ManufacturerPickerDropdown
          items={outboardGear}
          usageCounts={outboardUsageCounts}
          getQuantity={(g) => g.quantity}
          selectedId={slot?.outboardId ?? null}
          onSelect={(outboardId) => onSlotChange({ outboardId })}
          outerGroupBy={(g) => POOL_LABELS[g.poolType]}
          outerGroupOrder={POOL_ORDER}
          stripManufacturerInTrigger
        />
      )}
      {hintText && <div className="warning-badge">⚠ Preset expected: {hintText}</div>}
    </td>
  )
}

interface Props {
  item: SetupItemDraft
  mics: Mic[]
  outboardGear: OutboardGear[]
  preamps: Preamp[]
  outboardColumnCount: number
  isTemporary: boolean
  micSuggestions: string[]
  outboardSuggestions: string[]
  preampSuggestions: string[]
  selected: boolean
  conflict: boolean
  unresolvedGearHint: UnresolvedGearHint | undefined
  onClearUnresolvedGearHint: (field: 'mic' | 'outboard' | 'preamp') => void
  micUsageCounts: Map<number, number>
  outboardUsageCounts: Map<number, number>
  preampUsageCounts: Map<number, number>
  onGutterClick: (e: React.MouseEvent) => void
  onChange: (patch: Partial<SetupItemDraft>) => void
  onOutboardSlotChange: (
    slotIndex: number,
    patch: Partial<Pick<SetupItemOutboardSlot, 'outboardId' | 'outboardText'>>
  ) => void
  onDelete: () => void
}

export default function SetupSheetRow({
  item,
  mics,
  outboardGear,
  preamps,
  outboardColumnCount,
  isTemporary,
  micSuggestions,
  outboardSuggestions,
  preampSuggestions,
  selected,
  conflict,
  unresolvedGearHint,
  onClearUnresolvedGearHint,
  micUsageCounts,
  outboardUsageCounts,
  preampUsageCounts,
  onGutterClick,
  onChange,
  onOutboardSlotChange,
  onDelete
}: Props): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const rowStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: selected ? 'var(--color-surface-alt)' : undefined
  }
  function handleMicChange(micId: number | null): void {
    const mic = micId != null ? mics.find((m) => m.id === micId) ?? null : null
    const nextNotes = applyMicPoolNotesTag(item.notes ?? '', mic?.poolType ?? null)
    onChange({ micId, notes: nextNotes })
    onClearUnresolvedGearHint('mic')
  }

  function handleOutboardSlotChange(
    slotIndex: number,
    patch: Partial<Pick<SetupItemOutboardSlot, 'outboardId' | 'outboardText'>>
  ): void {
    if ('outboardId' in patch) {
      const gear = patch.outboardId != null ? outboardGear.find((g) => g.id === patch.outboardId) ?? null : null
      onChange({ notes: applyMicPoolNotesTag(item.notes ?? '', gear?.poolType ?? null) })
      onClearUnresolvedGearHint('outboard')
    }
    onOutboardSlotChange(slotIndex, patch)
  }

  function handlePreampChange(preampId: number | null): void {
    const preamp = preampId != null ? preamps.find((p) => p.id === preampId) ?? null : null
    const nextNotes = applyMicPoolNotesTag(item.notes ?? '', preamp?.poolType ?? null)
    onChange({ preampId, notes: nextNotes })
    onClearUnresolvedGearHint('preamp')
  }

  const sourceName = useBufferedField(item.sourceName, (v) => onChange({ sourceName: v }))
  const micText = useBufferedField(item.micText ?? '', (v) => onChange({ micText: v }))
  const preampText = useBufferedField(item.preampText ?? '', (v) => onChange({ preampText: v }))
  const channel = useBufferedField(String(item.channel ?? ''), (v) =>
    onChange({ channel: v ? Math.max(1, Number(v)) : null })
  )
  const tieLine = useBufferedField(String(item.tieLine ?? ''), (v) =>
    onChange({ tieLine: v ? Math.max(1, Number(v)) : null })
  )
  const cueBox = useBufferedField(String(item.cueBox ?? ''), (v) =>
    onChange({ cueBox: v ? Math.max(1, Number(v)) : null })
  )
  const notes = useBufferedField(item.notes ?? '', (v) => onChange({ notes: v }))

  return (
    <tr ref={setNodeRef} style={rowStyle}>
      <td onClick={onGutterClick} style={{ cursor: 'pointer', userSelect: 'none' }}>
        <span
          className="drag-handle"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: 'grab' }}
        >
          ⠿
        </span>
      </td>
      <td>
        <input
          value={sourceName.value}
          placeholder="Source name"
          onChange={(e) => sourceName.onChange(e.target.value)}
          onBlur={sourceName.onBlur}
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {isTemporary ? (
          <>
            <input
              value={micText.value}
              placeholder="Mic"
              onChange={(e) => micText.onChange(e.target.value)}
              onBlur={micText.onBlur}
              onClick={(e) => e.stopPropagation()}
              list={`mic-suggestions-${item.id}`}
            />
            <datalist id={`mic-suggestions-${item.id}`}>
              {micSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </>
        ) : (
          <ManufacturerPickerDropdown
            items={mics}
            usageCounts={micUsageCounts}
            getQuantity={(m) => m.quantity}
            selectedId={item.micId}
            onSelect={handleMicChange}
            outerGroupBy={(m) => POOL_LABELS[m.poolType]}
            outerGroupOrder={POOL_ORDER}
          />
        )}
        {unresolvedGearHint?.mic && (
          <div className="warning-badge">⚠ Preset expected: {unresolvedGearHint.mic}</div>
        )}
      </td>
      {Array.from({ length: outboardColumnCount }, (_, slotIndex) => (
        <OutboardSlotCell
          key={slotIndex}
          slotIndex={slotIndex}
          slot={item.outboards.find((s) => s.slotIndex === slotIndex)}
          isTemporary={isTemporary}
          outboardGear={outboardGear}
          outboardSuggestions={outboardSuggestions}
          outboardUsageCounts={outboardUsageCounts}
          itemId={item.id}
          hintText={slotIndex === 0 ? unresolvedGearHint?.outboard : undefined}
          onSlotChange={(patch) => handleOutboardSlotChange(slotIndex, patch)}
        />
      ))}
      <td>
        <input
          type="number"
          min={1}
          value={channel.value}
          onChange={(e) => channel.onChange(e.target.value)}
          onBlur={channel.onBlur}
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {isTemporary ? (
          <>
            <input
              value={preampText.value}
              placeholder="Preamp"
              onChange={(e) => preampText.onChange(e.target.value)}
              onBlur={preampText.onBlur}
              onClick={(e) => e.stopPropagation()}
              list={`preamp-suggestions-${item.id}`}
            />
            <datalist id={`preamp-suggestions-${item.id}`}>
              {preampSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </>
        ) : (
          <ManufacturerPickerDropdown
            items={preamps}
            usageCounts={preampUsageCounts}
            getQuantity={(p) => p.channels}
            selectedId={item.preampId}
            onSelect={handlePreampChange}
            outerGroupBy={(p) => PREAMP_POOL_LABELS[p.poolType]}
            outerGroupOrder={PREAMP_POOL_ORDER}
            stripManufacturerInTrigger
          />
        )}
        {unresolvedGearHint?.preamp && (
          <div className="warning-badge">⚠ Preset expected: {unresolvedGearHint.preamp}</div>
        )}
      </td>
      <td>
        <input
          type="number"
          min={1}
          value={tieLine.value}
          onChange={(e) => tieLine.onChange(e.target.value)}
          onBlur={tieLine.onBlur}
          onClick={(e) => e.stopPropagation()}
        />
        {conflict && <div className="warning-badge">⚠ duplicate tie line</div>}
      </td>
      <td>
        <input
          type="number"
          min={1}
          value={cueBox.value}
          onChange={(e) => cueBox.onChange(e.target.value)}
          onBlur={cueBox.onBlur}
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td style={{ textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={item.polarityFlip}
          onChange={(e) => onChange({ polarityFlip: e.target.checked })}
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td>
        <input
          value={notes.value}
          onChange={(e) => notes.onChange(e.target.value)}
          onBlur={notes.onBlur}
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td>
        <button
          className="btn small danger"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          ✕
        </button>
      </td>
    </tr>
  )
}
