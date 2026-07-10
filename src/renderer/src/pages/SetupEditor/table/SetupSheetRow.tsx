import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SetupItemDraft } from '@shared/types/setup'
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
  setup: 'This Session'
}
const PREAMP_POOL_ORDER = [PREAMP_POOL_LABELS.studio, PREAMP_POOL_LABELS.setup]

interface Props {
  item: SetupItemDraft
  mics: Mic[]
  outboardGear: OutboardGear[]
  preamps: Preamp[]
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
  onDelete: () => void
}

export default function SetupSheetRow({
  item,
  mics,
  outboardGear,
  preamps,
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

  function handleOutboardChange(outboardId: number | null): void {
    const gear = outboardId != null ? outboardGear.find((g) => g.id === outboardId) ?? null : null
    const nextNotes = applyMicPoolNotesTag(item.notes ?? '', gear?.poolType ?? null)
    onChange({ outboardId, notes: nextNotes })
    onClearUnresolvedGearHint('outboard')
  }

  // Preamps only ever come from the studio/session pools, neither of which ever produces a
  // notes tag (applyMicPoolNotesTag only tags building/faculty_reserve/personal pools) — so
  // unlike mic/outboard selection there's no notes side effect to apply here.
  function handlePreampChange(preampId: number | null): void {
    onChange({ preampId })
    onClearUnresolvedGearHint('preamp')
  }

  const sourceName = useBufferedField(item.sourceName, (v) => onChange({ sourceName: v }))
  const micText = useBufferedField(item.micText ?? '', (v) => onChange({ micText: v }))
  const outboardText = useBufferedField(item.outboardText ?? '', (v) => onChange({ outboardText: v }))
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
      <td onClick={(e) => e.stopPropagation()}>
        {isTemporary ? (
          <>
            <input
              value={outboardText.value}
              placeholder="Outboard"
              onChange={(e) => outboardText.onChange(e.target.value)}
              onBlur={outboardText.onBlur}
              onClick={(e) => e.stopPropagation()}
              list={`outboard-suggestions-${item.id}`}
            />
            <datalist id={`outboard-suggestions-${item.id}`}>
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
            selectedId={item.outboardId}
            onSelect={handleOutboardChange}
            outerGroupBy={(g) => POOL_LABELS[g.poolType]}
            outerGroupOrder={POOL_ORDER}
            stripManufacturerInTrigger
          />
        )}
        {unresolvedGearHint?.outboard && (
          <div className="warning-badge">⚠ Preset expected: {unresolvedGearHint.outboard}</div>
        )}
      </td>
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
