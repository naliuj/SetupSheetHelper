import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, GripVertical, Link2, X } from 'lucide-react'
import type { SetupItemDraft, SetupItemOutboardSlot } from '@shared/types/setup'
import type { SetupColumnKey } from '@shared/constants/setupColumns'
import type { Mic, OutboardGear, Preamp } from '@shared/types/entities'
import type { UnresolvedGearHint } from '@renderer/state/setupStore'
import ManufacturerPickerDropdown from '@renderer/components/ManufacturerPickerDropdown'
import SuggestInput from '@renderer/components/SuggestInput'
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
  outboardSuggestions,
  hintText,
  onSlotChange
}: {
  slot: SetupItemOutboardSlot | undefined
  isTemporary: boolean
  outboardGear: OutboardGear[]
  outboardUsageCounts: Map<number, number>
  outboardSuggestions: string[]
  hintText: string | undefined
  onSlotChange: (patch: Partial<Pick<SetupItemOutboardSlot, 'outboardId' | 'outboardText'>>) => void
}): JSX.Element {
  const outboardText = useBufferedField(slot?.outboardText ?? '', (v) => onSlotChange({ outboardText: v }))

  return (
    <td onClick={(e) => e.stopPropagation()}>
      {isTemporary ? (
        <SuggestInput
          value={outboardText.value}
          placeholder="Outboard"
          onChange={outboardText.onChange}
          onBlur={outboardText.onBlur}
          suggestions={outboardSuggestions}
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
          clearLabel="No Outboard"
        />
      )}
      {hintText ? (
        <div className="warning-badge inline-icon-text">
          <AlertTriangle size={12} aria-hidden="true" />
          Preset expected: {hintText}
        </div>
      ) : (
        !slot?.outboardId &&
        slot?.outboardText && (
          <div className="warning-badge inline-icon-text">
            <AlertTriangle size={12} aria-hidden="true" />
            Unresolved: {slot.outboardText}
          </div>
        )
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
  micSuggestions: string[]
  outboardSuggestions: string[]
  preampSuggestions: string[]
  selected: boolean
  /** Whether this row hosts a link button on its bottom seam (true for every row except the last) —
   *  clicking it links this row with the one directly below, at any position. */
  hasSeamBelow: boolean
  /** Set on the two rows of a linked pair to draw the accent bracket: 'top' shares its groupId with
   *  the row below, 'bottom' with the row above. `null` for unlinked rows. */
  bracket: 'top' | 'bottom' | null
  /** Descending z-index (higher for earlier rows) for the seam gutter cell, so this row's
   *  border-straddling seam button paints above — and stays clickable over — the next row's cell. */
  seamZIndex: number
  onTogglePairLink: (id: number | string) => void
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
  /** Ongoing mic sync for an actively-linked pair — called after the top row's own mic change
   *  (see handleMicChange below); the table resolves the partner and applies the quantity check. */
  onSyncPairMic: (id: number | string, micId: number | null) => void
  /** Same as onSyncPairMic, for preamp — called after the top row's own preamp change (see
   *  handlePreampChange below). */
  onSyncPairPreamp: (id: number | string, preampId: number | null) => void
  /** Ongoing sync for 48V/channel/tie line/cue box — called after the top row's own onChange with
   *  whichever of those keys were part of the patch; the table resolves the partner and, for the
   *  numeric fields, carries the pair's "N / N+1" convention forward rather than duplicating it. */
  onSyncPairFields: (id: number | string, patch: Partial<SetupItemDraft>) => void
  /** Ongoing outboard sync for an actively-linked pair — mirrors one slot onto the partner. */
  onSyncPairOutboardSlot: (
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
  micSuggestions,
  outboardSuggestions,
  preampSuggestions,
  selected,
  hasSeamBelow,
  bracket,
  seamZIndex,
  onTogglePairLink,
  conflict,
  unresolvedGearHint,
  onClearUnresolvedGearHint: onClearUnresolvedGearHintById,
  micUsageCounts,
  outboardUsageCounts,
  preampUsageCounts,
  onGutterClick: onGutterClickById,
  onChange: onChangeById,
  onOutboardSlotChange: onOutboardSlotChangeById,
  onSyncPairMic,
  onSyncPairPreamp,
  onSyncPairFields,
  onSyncPairOutboardSlot,
  onDelete: onDeleteById
}: Props): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  // Thin id-bound wrappers so the rest of the component keeps its original single-row API. Once a
  // pair is linked, either row pushes its changes to the other — the table resolves which row is
  // "top"/"bottom" to get the channel/tie line/cue box offset direction right regardless of which
  // side was edited. A non-null `bracket` means this row belongs to a linked pair.
  const isPairSyncSource = bracket != null
  const onChange = (patch: Partial<SetupItemDraft>): void => {
    onChangeById(item.id, patch)
    if (isPairSyncSource) onSyncPairFields(item.id, patch)
  }
  const onOutboardSlotChange = (
    slotIndex: number,
    patch: Partial<Pick<SetupItemOutboardSlot, 'outboardId' | 'outboardText'>>
  ): void => {
    onOutboardSlotChangeById(item.id, slotIndex, patch)
    if (isPairSyncSource) onSyncPairOutboardSlot(item.id, slotIndex, patch)
  }
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
    // Only the top row of an actively-linked pair drives the sync — changing the bottom row's mic
    // never pushes back up.
    if (isPairSyncSource) onSyncPairMic(item.id, micId)
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
    // Only the top row of an actively-linked pair drives the sync — changing the bottom row's
    // preamp never pushes back up.
    if (isPairSyncSource) onSyncPairPreamp(item.id, preampId)
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
  // Channel and tie line push to the linked partner on every keystroke, not just on blur like the
  // rest of the buffered fields — seeing the paired channel/tie line update live (rather than only
  // once you tab away) is what makes the pairing visually obvious while you're actively numbering a
  // sheet. This row's own value still only commits to the store (and autosave) on blur as usual;
  // only the partner's value is pushed immediately.
  function handleChannelInputChange(raw: string): void {
    channel.onChange(raw)
    if (isPairSyncSource) onSyncPairFields(item.id, { channel: raw ? Math.max(1, Number(raw)) : null })
  }
  function handleTieLineInputChange(raw: string): void {
    tieLine.onChange(raw)
    if (isPairSyncSource) onSyncPairFields(item.id, { tieLine: raw ? Math.max(1, Number(raw)) : null })
  }
  const cueBox = useBufferedField(String(item.cueBox ?? ''), (v) =>
    onChange({ cueBox: v ? Math.max(1, Number(v)) : null })
  )
  const notes = useBufferedField(item.notes ?? '', (v) => onChange({ notes: v }))

  return (
    <tr ref={setNodeRef} style={rowStyle}>
      {/* Slim leftmost stereo-pair link column (toggleable via the Columns menu). Every row except
          the last hosts a link-icon toggle on its bottom seam (faint at rest, accent on hover), so
          any two adjacent rows can be paired regardless of position. When a pair is linked, an
          accent bracket "[" is drawn against the left edge spanning both rows (spine + an inward
          tick top and bottom, split across the two cells). A high z-index on seam-hosting cells lets
          the seam-straddling icon paint over the next row (later in DOM order). */}
      {visibleColumns.has('stereoLink') && (
        <td
          style={{
            width: 20,
            padding: 0,
            position: 'relative',
            overflow: 'visible',
            zIndex: hasSeamBelow ? seamZIndex : undefined
          }}
        >
          {bracket && (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 2,
                width: 6,
                // Top cell draws the upper half of the "[" (spine down to the seam + top tick);
                // bottom cell draws the lower half (spine up from the seam + bottom tick).
                top: bracket === 'top' ? 3 : 0,
                bottom: bracket === 'bottom' ? 3 : 0,
                borderLeft: '2px solid var(--color-accent)',
                borderTop: bracket === 'top' ? '2px solid var(--color-accent)' : undefined,
                borderBottom: bracket === 'bottom' ? '2px solid var(--color-accent)' : undefined
              }}
            />
          )}
          {hasSeamBelow &&
            (() => {
              // The seam below this row is "linked" exactly when this row is the top of a pair.
              const seamLinked = bracket === 'top'
              return (
                <button
                  aria-label={seamLinked ? 'Linked stereo pair — click to unlink' : 'Link with the row below as a stereo pair'}
                  title={seamLinked ? 'Linked stereo pair — click to unlink' : 'Link with the row below as a stereo pair'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onTogglePairLink(item.id)
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1'
                    e.currentTarget.style.color = 'var(--color-accent)'
                  }}
                  onMouseLeave={(e) => {
                    if (!seamLinked) {
                      e.currentTarget.style.opacity = '0.5'
                      e.currentTarget.style.color = 'var(--color-text-dim)'
                    }
                  }}
                  style={{
                    position: 'absolute',
                    left: 6,
                    top: '100%',
                    transform: 'translateY(-50%)',
                    zIndex: 2,
                    padding: 2,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: seamLinked ? 1 : 0.5,
                    color: seamLinked ? 'var(--color-accent)' : 'var(--color-text-dim)'
                  }}
                >
                  <Link2 size={13} aria-hidden="true" />
                </button>
              )
            })()}
        </td>
      )}
      <td
        className="gutter-cell"
        onClick={(e) => onGutterClickById(e, item.id)}
        title="Click to select · Shift-click for a range · Cmd/Ctrl-click to toggle"
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <span className="drag-handle" {...attributes} {...listeners} style={{ cursor: 'grab' }}>
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
            <SuggestInput
              value={micText.value}
              placeholder="Mic"
              onChange={micText.onChange}
              onBlur={micText.onBlur}
              suggestions={micSuggestions}
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
              clearLabel="No Mic"
            />
          )}
          {unresolvedGearHint?.mic ? (
            <div className="warning-badge inline-icon-text">
              <AlertTriangle size={12} aria-hidden="true" />
              Preset expected: {unresolvedGearHint.mic}
            </div>
          ) : (
            !item.micId &&
            item.micText && (
              <div className="warning-badge inline-icon-text">
                <AlertTriangle size={12} aria-hidden="true" />
                Unresolved: {item.micText}
              </div>
            )
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
            outboardSuggestions={outboardSuggestions}
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
            onChange={(e) => handleChannelInputChange(e.target.value)}
            onBlur={channel.onBlur}
            onClick={(e) => e.stopPropagation()}
          />
        </td>
      )}
      {visibleColumns.has('preamp') && (
        <td onClick={(e) => e.stopPropagation()}>
          {isTemporary ? (
            <SuggestInput
              value={preampText.value}
              placeholder="Preamp"
              onChange={preampText.onChange}
              onBlur={preampText.onBlur}
              suggestions={preampSuggestions}
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
              clearLabel="No Preamp"
            />
          )}
          {unresolvedGearHint?.preamp ? (
            <div className="warning-badge inline-icon-text">
              <AlertTriangle size={12} aria-hidden="true" />
              Preset expected: {unresolvedGearHint.preamp}
            </div>
          ) : (
            !item.preampId &&
            item.preampText && (
              <div className="warning-badge inline-icon-text">
                <AlertTriangle size={12} aria-hidden="true" />
                Unresolved: {item.preampText}
              </div>
            )
          )}
        </td>
      )}
      {visibleColumns.has('tieLine') && (
        <td>
          <input
            type="number"
            min={1}
            value={tieLine.value}
            onChange={(e) => handleTieLineInputChange(e.target.value)}
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
