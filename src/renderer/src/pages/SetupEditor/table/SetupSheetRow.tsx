import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, GripVertical, X } from 'lucide-react'
import type { SetupItemDraft, SetupItemOutboardSlot } from '@shared/types/setup'
import type { SetupColumnKey } from '@shared/constants/setupColumns'
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

// Hoisted to module scope so ManufacturerPickerDropdown's internal useMemo (keyed on these
// props) sees stable references across renders instead of a fresh lambda every time.
const micGroupBy = (m: Mic): string => POOL_LABELS[m.poolType]
const micQuantity = (m: Mic): number => m.quantity
const outboardGroupBy = (g: OutboardGear): string => POOL_LABELS[g.poolType]
const outboardQuantity = (g: OutboardGear): number => g.quantity
const preampGroupBy = (p: Preamp): string => PREAMP_POOL_LABELS[p.poolType]
const preampQuantity = (p: Preamp): number => p.channels

// A single Outboard column's cell. Extracted as its own component (rather than an inline
// loop body) because each slot needs its own independent useBufferedField hook instance, and
// hooks can't be called a variable number of times inside a plain loop (Rules of Hooks).
function OutboardSlotCell({
  slot,
  isTemporary,
  outboardGear,
  outboardUsageCounts,
  hintText,
  onSlotChange
}: {
  slot: SetupItemOutboardSlot | undefined
  isTemporary: boolean
  outboardGear: OutboardGear[]
  outboardUsageCounts: Map<number, number>
  hintText: string | undefined
  onSlotChange: (patch: Partial<Pick<SetupItemOutboardSlot, 'outboardId' | 'outboardText'>>) => void
}): JSX.Element {
  const outboardText = useBufferedField(slot?.outboardText ?? '', (v) => onSlotChange({ outboardText: v }))

  return (
    <td onClick={(e) => e.stopPropagation()}>
      {isTemporary ? (
        <input
          value={outboardText.value}
          placeholder="Outboard"
          onChange={(e) => outboardText.onChange(e.target.value)}
          onBlur={outboardText.onBlur}
          onClick={(e) => e.stopPropagation()}
          list="outboard-suggestions"
        />
      ) : (
        <ManufacturerPickerDropdown
          items={outboardGear}
          usageCounts={outboardUsageCounts}
          getQuantity={outboardQuantity}
          selectedId={slot?.outboardId ?? null}
          onSelect={(outboardId) => onSlotChange({ outboardId })}
          outerGroupBy={outboardGroupBy}
          outerGroupOrder={POOL_ORDER}
          stripManufacturerInTrigger
        />
      )}
      {hintText && (
        <div className="warning-badge inline-icon-text">
          <AlertTriangle size={12} aria-hidden="true" />
          Preset expected: {hintText}
        </div>
      )}
    </td>
  )
}

// Every callback takes the row's id (rather than closing over it in the table's map) so the
// table can pass referentially-stable functions and React.memo below can actually bail out.
interface Props {
  item: SetupItemDraft
  mics: Mic[]
  outboardGear: OutboardGear[]
  preamps: Preamp[]
  outboardColumnCount: number
  visibleColumns: Set<SetupColumnKey>
  isTemporary: boolean
  selected: boolean
  conflict: boolean
  unresolvedGearHint: UnresolvedGearHint | undefined
  onClearUnresolvedGearHint: (id: number | string, field: 'mic' | 'outboard' | 'preamp') => void
  micUsageCounts: Map<number, number>
  outboardUsageCounts: Map<number, number>
  preampUsageCounts: Map<number, number>
  onGutterClick: (e: React.MouseEvent, id: number | string) => void
  onChange: (id: number | string, patch: Partial<SetupItemDraft>) => void
  onOutboardSlotChange: (
    id: number | string,
    slotIndex: number,
    patch: Partial<Pick<SetupItemOutboardSlot, 'outboardId' | 'outboardText'>>
  ) => void
  onDelete: (id: number | string) => void
}

function SetupSheetRow({
  item,
  mics,
  outboardGear,
  preamps,
  outboardColumnCount,
  visibleColumns,
  isTemporary,
  selected,
  conflict,
  unresolvedGearHint,
  onClearUnresolvedGearHint: onClearUnresolvedGearHintById,
  micUsageCounts,
  outboardUsageCounts,
  preampUsageCounts,
  onGutterClick: onGutterClickById,
  onChange: onChangeById,
  onOutboardSlotChange: onOutboardSlotChangeById,
  onDelete: onDeleteById
}: Props): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  // Thin id-bound wrappers so the rest of the component keeps its original single-row API.
  const onChange = (patch: Partial<SetupItemDraft>): void => onChangeById(item.id, patch)
  const onOutboardSlotChange = (
    slotIndex: number,
    patch: Partial<Pick<SetupItemOutboardSlot, 'outboardId' | 'outboardText'>>
  ): void => onOutboardSlotChangeById(item.id, slotIndex, patch)
  const onClearUnresolvedGearHint = (field: 'mic' | 'outboard' | 'preamp'): void =>
    onClearUnresolvedGearHintById(item.id, field)
  const onDelete = (): void => onDeleteById(item.id)
  // A row's color is a wash over the page background. The mix strength comes from the themed
  // --row-color-tint-percent (global.css) rather than a fixed number here: dark mode mixes toward
  // a dark bg so a lighter wash keeps text legible, but light mode's bg is near-white, so the same
  // low percentage would wash every color out much paler than its picker swatch — light mode uses
  // full strength instead. Selection is signaled by a crisp accent bar down the left edge (an
  // inset box-shadow) rather than by tinting the whole row — that way a colored row keeps its own
  // color intact when selected instead of clashing with the accent. Uncolored rows get a faint
  // accent wash in addition to the bar so selection still reads on a plain row.
  const colorTint = item.color
    ? `color-mix(in srgb, ${item.color} var(--row-color-tint-percent), var(--color-bg))`
    : null
  const selectedBg = colorTint ?? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface-alt))'
  const rowStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: selected ? selectedBg : (colorTint ?? undefined),
    boxShadow: selected ? 'inset 3px 0 0 var(--color-accent)' : undefined
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
      <td
        className="gutter-cell"
        onClick={(e) => onGutterClickById(e, item.id)}
        title="Click to select · Shift-click for a range · Cmd/Ctrl-click to toggle"
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <span
          className="drag-handle"
          {...attributes}
          {...listeners}
          style={{ cursor: 'grab' }}
        >
          <GripVertical size={16} aria-hidden="true" />
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
      {visibleColumns.has('mic') && (
        <td onClick={(e) => e.stopPropagation()}>
          {isTemporary ? (
            <input
              value={micText.value}
              placeholder="Mic"
              onChange={(e) => micText.onChange(e.target.value)}
              onBlur={micText.onBlur}
              onClick={(e) => e.stopPropagation()}
              list="mic-suggestions"
            />
          ) : (
            <ManufacturerPickerDropdown
              items={mics}
              usageCounts={micUsageCounts}
              getQuantity={micQuantity}
              selectedId={item.micId}
              onSelect={handleMicChange}
              outerGroupBy={micGroupBy}
              outerGroupOrder={POOL_ORDER}
            />
          )}
          {unresolvedGearHint?.mic && (
            <div className="warning-badge inline-icon-text">
              <AlertTriangle size={12} aria-hidden="true" />
              Preset expected: {unresolvedGearHint.mic}
            </div>
          )}
        </td>
      )}
      {visibleColumns.has('phantomPower') && (
        <td style={{ textAlign: 'center' }}>
          <input
            type="checkbox"
            checked={item.phantomPower}
            onChange={(e) => onChange({ phantomPower: e.target.checked })}
            onClick={(e) => e.stopPropagation()}
          />
        </td>
      )}
      {visibleColumns.has('outboard') &&
        Array.from({ length: outboardColumnCount }, (_, slotIndex) => (
          <OutboardSlotCell
            key={slotIndex}
            slot={item.outboards.find((s) => s.slotIndex === slotIndex)}
            isTemporary={isTemporary}
            outboardGear={outboardGear}
            outboardUsageCounts={outboardUsageCounts}
            hintText={slotIndex === 0 ? unresolvedGearHint?.outboard : undefined}
            onSlotChange={(patch) => handleOutboardSlotChange(slotIndex, patch)}
          />
        ))}
      {visibleColumns.has('channel') && (
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
      )}
      {visibleColumns.has('preamp') && (
        <td onClick={(e) => e.stopPropagation()}>
          {isTemporary ? (
            <input
              value={preampText.value}
              placeholder="Preamp"
              onChange={(e) => preampText.onChange(e.target.value)}
              onBlur={preampText.onBlur}
              onClick={(e) => e.stopPropagation()}
              list="preamp-suggestions"
            />
          ) : (
            <ManufacturerPickerDropdown
              items={preamps}
              usageCounts={preampUsageCounts}
              getQuantity={preampQuantity}
              selectedId={item.preampId}
              onSelect={handlePreampChange}
              outerGroupBy={preampGroupBy}
              outerGroupOrder={PREAMP_POOL_ORDER}
              stripManufacturerInTrigger
            />
          )}
          {unresolvedGearHint?.preamp && (
            <div className="warning-badge inline-icon-text">
              <AlertTriangle size={12} aria-hidden="true" />
              Preset expected: {unresolvedGearHint.preamp}
            </div>
          )}
        </td>
      )}
      {visibleColumns.has('tieLine') && (
        <td>
          <input
            type="number"
            min={1}
            value={tieLine.value}
            onChange={(e) => tieLine.onChange(e.target.value)}
            onBlur={tieLine.onBlur}
            onClick={(e) => e.stopPropagation()}
          />
          {conflict && (
            <div className="warning-badge inline-icon-text">
              <AlertTriangle size={12} aria-hidden="true" />
              duplicate tie line
            </div>
          )}
        </td>
      )}
      {visibleColumns.has('cueBox') && (
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
      )}
      {visibleColumns.has('polarity') && (
        <td style={{ textAlign: 'center' }}>
          <input
            type="checkbox"
            checked={item.polarityFlip}
            onChange={(e) => onChange({ polarityFlip: e.target.checked })}
            onClick={(e) => e.stopPropagation()}
          />
        </td>
      )}
      {visibleColumns.has('notes') && (
        <td>
          <input
            value={notes.value}
            onChange={(e) => notes.onChange(e.target.value)}
            onBlur={notes.onBlur}
            onClick={(e) => e.stopPropagation()}
          />
        </td>
      )}
      <td>
        <button
          className="btn small danger"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          aria-label="Delete row"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </td>
    </tr>
  )
}

// Memoized: with per-row callbacks id-based and stable, and the table's derived Maps memoized
// on items, a selection click / hint update / catalog load no longer re-renders every row —
// only rows whose own props actually changed.
export default memo(SetupSheetRow)
