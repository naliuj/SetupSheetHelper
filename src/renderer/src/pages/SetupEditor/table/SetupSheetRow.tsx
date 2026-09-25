import { Fragment, memo, useMemo, useState, type CSSProperties } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { readableTextColor } from '@shared/constants/swatches'
import {
  STEREO_BRACE_BOTTOM,
  STEREO_BRACE_LANE_INSET,
  STEREO_BRACE_STROKE,
  STEREO_BRACE_SCREEN_WIDTH,
  STEREO_BRACE_SPAN_PERCENT,
  STEREO_BRACE_TOP,
  STEREO_BRACE_VIEWBOX,
  STEREO_LANE_WIDTH
} from '@shared/constants/stereoBrace'
import { useThemeStore } from '@renderer/state/themeStore'
import { AlertTriangle, GripVertical, Link2, X } from 'lucide-react'
import { computeUsedByOthers, type GearUsage } from '@renderer/state/usageCounts'
import { buildGearSearchGroups } from '@renderer/state/gearSearchGroups'
import type { SetupItemDraft, SetupItemOutboardSlot } from '@shared/types/setup'
import type { SetupColumnKey } from '@shared/constants/setupColumns'
import type { Mic, OutboardGear, Preamp } from '@shared/types/entities'
import type { UnresolvedGearHint } from '@renderer/state/setupStore'
import ManufacturerPickerDropdown from '@renderer/components/ManufacturerPickerDropdown'
import SuggestInput, { type Suggestion } from '@renderer/components/SuggestInput'
import CustomGearModal from '@renderer/components/CustomGearModal'
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
  gearUsage,
  itemId,
  slotIndex,
  outboardSuggestions,
  hintText,
  onSlotChange
}: {
  slot: SetupItemOutboardSlot | undefined
  isTemporary: boolean
  outboardGear: OutboardGear[]
  gearUsage: GearUsage
  itemId: number | string
  /** Which Outboard column this cell is — the capacity check needs it so replacing the unit
   *  already in THIS slot doesn't count as adding a second one. */
  slotIndex: number
  outboardSuggestions: Suggestion[]
  hintText: string | undefined
  onSlotChange: (patch: Partial<Pick<SetupItemOutboardSlot, 'outboardId' | 'outboardText'>>) => void
}): JSX.Element {
  // Hoisted to the component body: the picker below is behind an `isTemporary` branch, so a
  // useMemo inline in its props would be a conditional hook.
  const outboardSearchGroups = useMemo(
    () =>
      buildGearSearchGroups(outboardGear, {
        capacity: outboardQuantity,
        usedByOthers: (g) => gearUsage.usedByOthers('outboard', itemId, g.id),
        isFull: (g) => gearUsage.wouldExceedCapacity('outboard', itemId, slotIndex, g.id, g.quantity),
        poolLabel: outboardGroupBy
      }),
    [outboardGear, gearUsage, itemId, slotIndex]
  )
  const outboardText = useBufferedField(slot?.outboardText ?? '', (v) => onSlotChange({ outboardText: v }))
  // Local, not lifted to the row: this cell is already its own component (see the extraction note
  // above), so it can own its "Custom…" modal directly instead of routing through SetupSheetRow.
  const [customOpen, setCustomOpen] = useState(false)

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
          usedByOthers={(g) => gearUsage.usedByOthers('outboard', itemId, g.id)}
          isAtCapacity={(g) => gearUsage.wouldExceedCapacity('outboard', itemId, slotIndex, g.id, g.quantity)}
          searchGroups={outboardSearchGroups}
          getQuantity={outboardQuantity}
          selectedId={slot?.outboardId ?? null}
          onSelect={(outboardId) => onSlotChange({ outboardId })}
          outerGroupBy={outboardGroupBy}
          outerGroupOrder={POOL_ORDER}
          stripManufacturerInTrigger
          clearLabel="No Outboard"
          onCustom={() => setCustomOpen(true)}
          customValue={slot?.outboardId != null ? null : slot?.outboardText}
        />
      )}
      {hintText && (
        <div className="warning-badge inline-icon-text">
          <AlertTriangle size={12} aria-hidden="true" />
          Preset expected: {hintText}
        </div>
      )}
      {customOpen && (
        <CustomGearModal
          kind="Outboard"
          initialValue={slot?.outboardText ?? ''}
          onClose={() => setCustomOpen(false)}
          onConfirm={(value) => onSlotChange({ outboardId: null, outboardText: value })}
        />
      )}
    </td>
  )
}

// Every callback takes the row's id (rather than closing over it in the table's map) so the
// table can pass referentially-stable functions and React.memo below can actually bail out.
/** Padding between the setup sheet table and the edge of its pane. The selection bar reaches
 *  back across exactly this distance to sit on the pane's edge, so the two must agree. */
export const SHEET_EDGE_INSET = 12

interface Props {
  item: SetupItemDraft
  mics: Mic[]
  outboardGear: OutboardGear[]
  preamps: Preamp[]
  outboardColumnCount: number
  /** The user's visible columns in their chosen left-to-right order, EXCLUDING 'stereoLink' (which
   *  is pinned leftmost — see showStereoLink). Precomputed and memoized by the table so this
   *  memoized row doesn't rebuild it per render, and so header and cells can't fall out of step. */
  orderedColumns: SetupColumnKey[]
  /** Whether the pinned leftmost stereo-pair column is shown. Separate from orderedColumns because
   *  it isn't reorderable: it draws an absolutely-positioned bracket that only reads at the edge. */
  showStereoLink: boolean
  isTemporary: boolean
  micSuggestions: Suggestion[]
  outboardSuggestions: Suggestion[]
  preampSuggestions: Suggestion[]
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
  gearUsage: GearUsage
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
  orderedColumns,
  showStereoLink,
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
  gearUsage,
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
  // Only the resolved theme, not the preference — what matters is the color actually on screen.
  const resolvedTheme = useThemeStore((s) => s.resolved)
  // Which field's "Custom…" modal is open, if any — only one can be open per row at a time, so a
  // single slot covers both mic and preamp (outboard's modal lives in OutboardSlotCell instead,
  // since that's already its own component).
  const [customFieldOpen, setCustomFieldOpen] = useState<'mic' | 'preamp' | null>(null)

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
  // A tinted row publishes its own foreground, and everything drawn ON the tint reads that instead
  // of a theme color: the drag handle, the warning badges, the pair bracket and its seam button,
  // the selection bar, and the cell dividers (at a fraction, so they stay dividers rather than
  // turning into rules).
  //
  // LIGHT ONLY, and the condition is load-bearing rather than a shortcut. readableTextColor judges
  // the raw swatch. In light mode that IS the row background, because the tint mixes at 100%. In
  // dark mode the background is the swatch mixed 32% toward #14161a, which is always dark however
  // light the swatch is — so judging the raw swatch there returns near-black for a pale pink and
  // lands 2.2:1 on a background that is actually dark. Dark mode has never had the problem this
  // solves: its 32% mix doubles as a contrast guarantee, and the existing foreground measures 6:1
  // or better on every swatch in the palette.
  const rowFg = item.color && resolvedTheme === 'light' ? readableTextColor(item.color) : null
  const rowStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: selected ? selectedBg : (colorTint ?? undefined),
    ...(rowFg
      ? { '--row-fg': rowFg, '--row-edge': `color-mix(in srgb, ${rowFg} 28%, transparent)` }
      : {})
  } as CSSProperties
  // The selection bar runs down the far left edge of the pane, out past the table's own inset
  // (SHEET_EDGE_INSET), so it reads as a margin marker rather than something drawn on the row.
  //
  // It is its own element inside the row's FIRST CELL, never a box-shadow on the <tr>. A row's
  // box-shadow paints in the row's background layer, underneath its cells, so any cell with a
  // background of its own covers it — and the stereo lane is opaque by design (it keeps the page
  // background so the brace reads the same on every row). That is how selected rows lost their
  // bar when the lane was introduced. Sitting outside the table, the bar is always on the page
  // background too, so it is always the accent: nothing about the row's tint can reach it.
  const selectionBar = selected ? (
    <span aria-hidden="true" className="row-selection-bar" style={{ left: -SHEET_EDGE_INSET }} />
  ) : null
  function handleMicChange(micId: number | null): void {
    const mic = micId != null ? mics.find((m) => m.id === micId) ?? null : null
    const nextNotes = applyMicPoolNotesTag(item.notes ?? '', mic?.poolType ?? null)
    // A real catalog pick (or clearing to "No Mic") always supersedes any earlier Custom text, so
    // it can't resurface later if the catalog pick is itself cleared — see handleMicCustom below,
    // the only place micText gets set again.
    onChange({ micId, micText: null, notes: nextNotes })
    onClearUnresolvedGearHint('mic')
    // Only the top row of an actively-linked pair drives the sync — changing the bottom row's mic
    // never pushes back up.
    if (isPairSyncSource) onSyncPairMic(item.id, micId)
  }

  // Free-text entry from the picker's "Custom…" row, for studios that aren't already in the
  // always-free-text `isTemporary` mode. Deliberately does NOT call onSyncPairMic — that sync is
  // quantity-gated catalog-item propagation and has no meaning for a typed name; mic free text has
  // never propagated to a linked partner (the isTemporary/SuggestInput path doesn't either).
  function handleMicCustom(text: string): void {
    onChange({ micId: null, micText: text, notes: applyMicPoolNotesTag(item.notes ?? '', null) })
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
    // A real pick or a plain clear (outboardId present, no outboardText of its own) blanks any
    // stale Custom text so it can't resurface later. A Custom patch already sets outboardText
    // itself (see OutboardSlotCell's onConfirm) and must not be overridden here.
    const finalPatch =
      'outboardId' in patch && !('outboardText' in patch) ? { ...patch, outboardText: null } : patch
    onOutboardSlotChange(slotIndex, finalPatch)
  }

  function handlePreampChange(preampId: number | null): void {
    const preamp = preampId != null ? preamps.find((p) => p.id === preampId) ?? null : null
    const nextNotes = applyMicPoolNotesTag(item.notes ?? '', preamp?.poolType ?? null)
    onChange({ preampId, preampText: null, notes: nextNotes })
    onClearUnresolvedGearHint('preamp')
    // Only the top row of an actively-linked pair drives the sync — changing the bottom row's
    // preamp never pushes back up.
    if (isPairSyncSource) onSyncPairPreamp(item.id, preampId)
  }

  // See handleMicCustom's comment — same free-text entry point, same reasons for not pair-syncing.
  function handlePreampCustom(text: string): void {
    onChange({ preampId: null, preampText: text, notes: applyMicPoolNotesTag(item.notes ?? '', null) })
    onClearUnresolvedGearHint('preamp')
  }

  // Both hoisted here rather than inline in the pickers' props: those live inside a per-column
  // switch, so a useMemo down there would be a conditional hook and would blow up the moment a
  // column was toggled.
  const micSearchGroups = useMemo(
    () =>
      buildGearSearchGroups(mics, {
        capacity: micQuantity,
        usedByOthers: (m) => computeUsedByOthers(micUsageCounts, item.micId, m.id),
        isFull: (m) => computeUsedByOthers(micUsageCounts, item.micId, m.id) >= m.quantity,
        poolLabel: micGroupBy
      }),
    [mics, micUsageCounts, item.micId]
  )
  const preampSearchGroups = useMemo(
    () =>
      buildGearSearchGroups(preamps, {
        capacity: preampQuantity,
        usedByOthers: (p) => gearUsage.usedByOthers('preamp', item.id, p.id),
        isFull: (p) => gearUsage.wouldExceedCapacity('preamp', item.id, null, p.id, p.channels),
        poolLabel: preampGroupBy
      }),
    [preamps, gearUsage, item.id]
  )
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
  // Free text, unlike channel/tie line: a cue is often a stereo pair summed on the console
  // ("1-2"), which a number input can't hold — Chromium's badInput state made typed pairs
  // silently vanish on the next re-render.
  const cueBox = useBufferedField(item.cueBox ?? '', (v) => onChange({ cueBox: v.trim() || null }))
  const notes = useBufferedField(item.notes ?? '', (v) => onChange({ notes: v }))

  // One cell per column key, dispatched so the row can render in whatever order the user chose.
  // Deliberately a plain function called from a .map (not a component) — it closes over the
  // useBufferedField results above, which MUST stay unconditional at the top level of the
  // component (Rules of Hooks). The one case that genuinely needs its own hook instance per
  // rendered cell is Outboard, whose slot count varies at runtime; that's why OutboardSlotCell
  // is a real component instead (see its own note above).
  function renderCell(key: SetupColumnKey): JSX.Element | null {
    switch (key) {
      // Pinned leftmost and rendered before the gutter — never reaches this dispatcher.
      case 'stereoLink':
        return null
      case 'mic':
        return (
          <td key={key} onClick={(e) => e.stopPropagation()}>
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
                usedByOthers={(m) => computeUsedByOthers(micUsageCounts, item.micId, m.id)}
                searchGroups={micSearchGroups}
                getQuantity={micQuantity}
                selectedId={item.micId}
                onSelect={handleMicChange}
                outerGroupBy={micGroupBy}
                outerGroupOrder={POOL_ORDER}
                clearLabel="No Mic"
                onCustom={() => setCustomFieldOpen('mic')}
                customValue={item.micId != null ? null : item.micText}
              />
            )}
            {unresolvedGearHint?.mic && (
              <div className="warning-badge inline-icon-text">
                <AlertTriangle size={12} aria-hidden="true" />
                Preset expected: {unresolvedGearHint.mic}
              </div>
            )}
            {customFieldOpen === 'mic' && (
              <CustomGearModal
                kind="Mic"
                initialValue={item.micText ?? ''}
                onClose={() => setCustomFieldOpen(null)}
                onConfirm={handleMicCustom}
              />
            )}
          </td>
        )
      case 'phantomPower':
        return (
          <td key={key} style={{ textAlign: 'center' }}>
            <input
              type="checkbox"
              checked={item.phantomPower}
              onChange={(e) => onChange({ phantomPower: e.target.checked })}
              onClick={(e) => e.stopPropagation()}
            />
          </td>
        )
      // One key, N adjacent cells — the outboard slots stay contiguous wherever the block lands.
      case 'outboard':
        return (
          <Fragment key={key}>
            {Array.from({ length: outboardColumnCount }, (_, slotIndex) => (
              <OutboardSlotCell
                key={slotIndex}
                slot={item.outboards.find((s) => s.slotIndex === slotIndex)}
                isTemporary={isTemporary}
                outboardGear={outboardGear}
                gearUsage={gearUsage}
                itemId={item.id}
                slotIndex={slotIndex}
                outboardSuggestions={outboardSuggestions}
                hintText={slotIndex === 0 ? unresolvedGearHint?.outboard : undefined}
                onSlotChange={(patch) => handleOutboardSlotChange(slotIndex, patch)}
              />
            ))}
          </Fragment>
        )
      case 'channel':
        return (
          <td key={key}>
            <input
              type="number"
              min={1}
              value={channel.value}
              onChange={(e) => handleChannelInputChange(e.target.value)}
              onBlur={channel.onBlur}
              onClick={(e) => e.stopPropagation()}
            />
          </td>
        )
      case 'preamp':
        return (
          <td key={key} onClick={(e) => e.stopPropagation()}>
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
                usedByOthers={(p) => gearUsage.usedByOthers('preamp', item.id, p.id)}
                isAtCapacity={(p) => gearUsage.wouldExceedCapacity('preamp', item.id, null, p.id, p.channels)}
                searchGroups={preampSearchGroups}
                getQuantity={preampQuantity}
                selectedId={item.preampId}
                onSelect={handlePreampChange}
                outerGroupBy={preampGroupBy}
                outerGroupOrder={PREAMP_POOL_ORDER}
                stripManufacturerInTrigger
                clearLabel="No Preamp"
                onCustom={() => setCustomFieldOpen('preamp')}
                customValue={item.preampId != null ? null : item.preampText}
              />
            )}
            {unresolvedGearHint?.preamp && (
              <div className="warning-badge inline-icon-text">
                <AlertTriangle size={12} aria-hidden="true" />
                Preset expected: {unresolvedGearHint.preamp}
              </div>
            )}
            {customFieldOpen === 'preamp' && (
              <CustomGearModal
                kind="Preamp"
                initialValue={item.preampText ?? ''}
                onClose={() => setCustomFieldOpen(null)}
                onConfirm={handlePreampCustom}
              />
            )}
          </td>
        )
      case 'tieLine':
        return (
          <td key={key}>
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
        )
      case 'cueBox':
        return (
          <td key={key}>
            <input
              type="text"
              value={cueBox.value}
              onChange={(e) => cueBox.onChange(e.target.value)}
              onBlur={cueBox.onBlur}
              onClick={(e) => e.stopPropagation()}
            />
          </td>
        )
      case 'polarity':
        return (
          <td key={key} style={{ textAlign: 'center' }}>
            <input
              type="checkbox"
              checked={item.polarityFlip}
              onChange={(e) => onChange({ polarityFlip: e.target.checked })}
              onClick={(e) => e.stopPropagation()}
            />
          </td>
        )
      case 'notes':
        return (
          <td key={key}>
            <input
              value={notes.value}
              onChange={(e) => notes.onChange(e.target.value)}
              onBlur={notes.onBlur}
              onClick={(e) => e.stopPropagation()}
            />
          </td>
        )
    }
  }

  return (
    <tr ref={setNodeRef} style={rowStyle}>
      {/* Slim leftmost stereo-pair link column (toggleable via the Columns menu). Every row except
          the last hosts a link-icon toggle on its bottom seam (faint at rest, accent on hover), so
          any two adjacent rows can be paired regardless of position. When a pair is linked, an
          accent curly brace spans both rows, drawn as two halves that overlap at the seam (see
          stereoBrace.ts); the toggle sits to the right of the brace's point so the point stays
          visible. A high z-index on seam-hosting cells lets the seam-straddling button paint over
          the next row (later in DOM order). */}
      {showStereoLink && (
        <td
          style={{
            width: STEREO_LANE_WIDTH,
            padding: 0,
            position: 'relative',
            overflow: 'visible',
            // The lane deliberately does NOT take the row tint. That is what lets the brace be one
            // color on every row: it always sits on the page background, so its contrast never
            // depends on which swatch the row happens to use. Reverting this would put the accent
            // back on top of a saturated tint, where it vanishes on a blue row.
            background: 'var(--color-bg)',
            zIndex: hasSeamBelow ? seamZIndex : undefined
          }}
        >
          {selectionBar}
          {bracket && (
            <svg
              aria-hidden="true"
              viewBox={`0 0 ${STEREO_BRACE_VIEWBOX.width} ${STEREO_BRACE_VIEWBOX.height}`}
              preserveAspectRatio="none"
              style={{
                position: 'absolute',
                left: STEREO_BRACE_LANE_INSET,
                // Anchor each half at its SEAM edge and give it an explicit sized box.
                //
                // Both dimensions have to be set in CSS. An <svg> with a width and no height is a
                // replaced element whose height resolves from the viewBox ratio, so the box came
                // out a fixed 24px tall, `bottom` was dropped as over-constrained, and each half
                // sat anchored to the top of its own cell — the halves did not reach each other and
                // preserveAspectRatio="none" never had a stretched box to act on.
                //
                // Anchoring at the seam rather than the outer edge is what lets the span be less
                // than the full row: the join stays exact and only the outer end moves in.
                width: STEREO_BRACE_SCREEN_WIDTH,
                height: `calc(${STEREO_BRACE_SPAN_PERCENT}%)`,
                // Flush with the cell edge, NOT pushed past it. Each half used to bleed 2px over
                // the divider to be sure the stroke bridged it, but only the top half's bleed is
                // ever visible — the top row's lane cell paints an opaque background and sits
                // higher in the stacking order, so it covers the bottom half's. The result was the
                // top arm poking 2px below where the bottom arm began, which is what read as the
                // middle of the brace dipping. Flush, both spikes land on the divider and coincide
                // as one point; their round caps are 0.9px each, so they still overlap across the
                // 1px border with nothing left to bridge.
                ...(bracket === 'top' ? { bottom: 0 } : { top: 0 }),
                overflow: 'visible'
              }}
            >
              <path
                d={bracket === 'top' ? STEREO_BRACE_TOP : STEREO_BRACE_BOTTOM}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={STEREO_BRACE_STROKE}
                // Keeps the line weight constant while preserveAspectRatio="none" stretches the
                // shape to whatever height this row turned out to be.
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
                      e.currentTarget.style.opacity = '0.72'
                      e.currentTarget.style.color = 'var(--color-text-dim)'
                    }
                  }}
                  style={{
                    position: 'absolute',
                    // To the RIGHT of the brace's leftward point, not on top of it. The point only
                    // exists here at the seam, and it is what makes the mark read as a brace rather
                    // than a bracket — a button centered on the brace's spine covers it completely.
                    left: STEREO_LANE_WIDTH - 6,
                    top: '100%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 4,
                    padding: 1,
                    border: 'none',
                    // A lane-colored disc, so the glyph reads cleanly where it crosses the row
                    // divider instead of sitting on top of the line.
                    background: 'var(--color-bg)',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    // No row-dependent color here at all: the lane is neutral, so one value works
                    // everywhere. 0.5 at rest was too faint even on neutral.
                    opacity: seamLinked ? 1 : 0.72,
                    color: seamLinked ? 'var(--color-accent)' : 'var(--color-text-dim)'
                  }}
                >
                  <Link2 size={12} aria-hidden="true" />
                </button>
              )
            })()}
        </td>
      )}
      <td
        className="gutter-cell"
        onClick={(e) => onGutterClickById(e, item.id)}
        title="Click to select · Shift-click for a range · Cmd/Ctrl-click to toggle"
        style={{ cursor: 'pointer', userSelect: 'none', position: 'relative' }}
      >
        {!showStereoLink && selectionBar}
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
      {orderedColumns.map((key) => renderCell(key))}
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
