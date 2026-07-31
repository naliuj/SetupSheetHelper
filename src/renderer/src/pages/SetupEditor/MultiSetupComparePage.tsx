import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  MultiSetupComparison,
  MultiSetupComparisonItem,
  MultiSetupComparisonMember
} from '@shared/types/setup'
import { Link2 } from 'lucide-react'
import type { Mic } from '@shared/types/entities'
import { normalizeSourceName } from '@shared/utils/normalizeSourceName'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import { applyMicPoolNotesTag } from '@renderer/state/micPoolNotesTag'
import { computeUsageCounts } from '@renderer/state/usageCounts'
import { useGearCatalogueSuggestions } from '@renderer/state/useGearCatalogueSuggestions'
import ManufacturerPickerDropdown from '@renderer/components/ManufacturerPickerDropdown'
import SuggestInput from '@renderer/components/SuggestInput'
import ToggleSwitch from '@renderer/components/ToggleSwitch'

// Mirrors the setup sheet's mic column (SetupSheetRow.tsx) so the pool grouping reads identically
// in both places. Hoisted to module scope for the same reason it is there: ManufacturerPickerDropdown
// memoizes on these props, and a fresh lambda each render defeats it.
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
const micGroupBy = (m: Mic): string => POOL_LABELS[m.poolType]
const micQuantity = (m: Mic): number => m.quantity
/** Stable empty map for a column whose pool hasn't landed yet — a fresh `new Map()` each render
 *  would defeat the picker's memoization for the same reason a fresh lambda would. */
const EMPTY_USAGE: Map<number, number> = new Map()

/** What a row costs the engineer.
 *  - `changed`: real changeover work — something has to be re-plugged, swapped or patched.
 *  - `renamed`: the patch is identical across every band; only the source's name differs. Two bands
 *    playing different instruments through the same mic on the same channel (a jazz sax and a
 *    bluegrass fiddle, both a KM184 on Ch 5) is the normal case, not a problem to fix.
 *  - `same`: identical patch, identical name. */
type RowStatus = 'same' | 'renamed' | 'changed'

interface Props {
  multiSetupId: number
  /** `didWrite` tells the editor whether the open setup needs reloading — an alignment or a rename
   *  from this page may have rewritten it behind setupStore's back. */
  onBack: (didWrite: boolean) => void
}

/** One grid row: a channel number (or a sheet position, for rows with no channel yet), plus each
 *  member's item(s) on it. */
interface CompareRow {
  key: string
  label: string
  /** Which section the row belongs to. Channel rows come first, then anything unpatched. */
  group: 'channel' | 'unassigned'
  /** Parallel to `members` — a member can have zero items here (nothing patched) or, since the app
   *  tolerates duplicate channels, more than one. */
  cells: MultiSetupComparisonItem[][]
  status: RowStatus
}

/** The patch: how a source is physically plugged in, and the ONLY thing that decides whether a row
 *  needs changeover work. The source name is deliberately absent — renaming a channel between bands
 *  is paperwork, not patch work.
 *
 *  This list is the single source of truth for both the comparison signature and the cell sub-line,
 *  so what the grid flags and what it shows you can never drift apart. It mirrors what
 *  alignMultiSetupRow writes; keep the two in step. */
const PATCH_FIELDS: { key: string; label: string; read: (item: MultiSetupComparisonItem) => string }[] = [
  { key: 'mic', label: 'Mic', read: (i) => i.micLabel ?? '' },
  { key: 'preamp', label: 'Preamp', read: (i) => i.preampLabel ?? '' },
  { key: 'tieLine', label: 'Tie line', read: (i) => (i.tieLine != null ? String(i.tieLine) : '') },
  { key: 'cueBox', label: 'Cue box', read: (i) => (i.cueBox != null ? String(i.cueBox) : '') },
  { key: 'phantom', label: '48V', read: (i) => (i.phantomPower ? 'on' : '') },
  { key: 'polarity', label: 'Polarity', read: (i) => (i.polarityFlip ? 'flipped' : '') },
  { key: 'outboard', label: 'Outboard', read: (i) => i.outboardLabels.join(', ') }
]

// A control character, not a visible one: gear names are free text and can contain any punctuation
// a separator might otherwise use, which would let two different patches produce one signature.
const FIELD_SEP = '\u001F'

function patchSignature(item: MultiSetupComparisonItem): string {
  return PATCH_FIELDS.map((f) => f.read(item)).join(FIELD_SEP)
}

/** Decides a row's status once its cells are filled. Shared by both bucketing strategies below. */
function rowStatus(cells: MultiSetupComparisonItem[][]): RowStatus {
  const signatures = cells.map((items) => (items.length === 1 ? patchSignature(items[0]) : null))
  // A member with nothing here is changeover on purpose — that's a patch or unpatch between
  // bands. So is a member with two rows in one slot.
  const patchAgrees = signatures.every((s) => s !== null && s === signatures[0])
  if (!patchAgrees) return 'changed'
  // Every cell has exactly one item at this point, so cells[i][0] is safe.
  const names = cells.map((items) => normalizeSourceName(items[0].sourceName))
  return names.every((n) => n === names[0]) ? 'same' : 'renamed'
}

/** Every row of every band, in two sections.
 *
 *  **Channels** are keyed on the channel number, never on the source name: the name is the thing
 *  that changes between bands, so keying on it would split a renamed source into two half-empty
 *  rows — "Kick In" present in one band and blank in the next, "Fiddle" blank in the first and
 *  present in the second — when it is one channel that simply got relabelled.
 *
 *  **Rows with no channel yet** have no such key, so they pair on their position among the other
 *  unpatched rows in their own sheet. That's the right guess because a new band starts life as a
 *  verbatim copy of the previous one (createSiblingSetupFrom), so the Nth unpatched row in each
 *  sheet is the same source until someone reorders it. When the sheets do diverge in length the
 *  surplus rows simply read as absent in the shorter band, which is the truth. */
function buildRows(members: MultiSetupComparisonMember[]): CompareRow[] {
  const channelBuckets = new Map<number, MultiSetupComparisonItem[][]>()
  const unassignedBuckets: MultiSetupComparisonItem[][][] = []

  members.forEach((member, memberIndex) => {
    let unassignedIndex = 0
    for (const item of member.items) {
      if (item.channel == null) {
        // Payload order is `sort_order, id` — the sheet's own row order.
        const bucket = (unassignedBuckets[unassignedIndex] ??= members.map(() => []))
        bucket[memberIndex].push(item)
        unassignedIndex += 1
        continue
      }
      let bucket = channelBuckets.get(item.channel)
      if (!bucket) {
        bucket = members.map(() => [])
        channelBuckets.set(item.channel, bucket)
      }
      bucket[memberIndex].push(item)
    }
  })

  const channelRows: CompareRow[] = [...channelBuckets]
    .sort((a, b) => a[0] - b[0])
    .map(([channel, cells]) => ({
      key: `ch:${channel}`,
      label: `Ch ${channel}`,
      group: 'channel' as const,
      cells,
      status: rowStatus(cells)
    }))

  const unassignedRows: CompareRow[] = unassignedBuckets.map((cells, i) => ({
    key: `pos:${i}`,
    label: '—',
    group: 'unassigned' as const,
    cells,
    status: rowStatus(cells)
  }))

  return [...channelRows, ...unassignedRows]
}

/** How a cell participates in a mic group, from the point of view of THIS column.
 *  - `top` / `bottom`: the partner sits in the row directly above or below in this grid, so the
 *    bracket can be drawn across the two exactly as the setup sheet draws it.
 *  - `apart`: the row is in a group whose partner isn't grid-adjacent — Compare orders by channel,
 *    the sheet by sort_order, so a pair on ch 5 and ch 9 is real but can't be bracketed. Shown as a
 *    plain link badge rather than silently hidden. */
type LinkRole = 'top' | 'bottom' | 'apart'

interface CellLink {
  role: LinkRole
  groupId: string
}

/** Per-column link state, keyed by item id.
 *
 *  Computed per column and never across them: sibling setups are made by copying, which carries
 *  group_id verbatim, so the same uuid is usually live in every band. Two cells in one row sharing
 *  a group id means nothing at all.
 *
 *  Adjacency is judged in the ORDER COMPARE IS SHOWING, not the sheet's — that's what the bracket
 *  has to span. Sheet order only decides whether a *new* link may be offered (see canLinkBelow). */
function buildLinkState(rows: CompareRow[], memberIndex: number): Map<number, CellLink> {
  const state = new Map<number, CellLink>()
  const single = (i: number): MultiSetupComparisonItem | null => {
    const cell = rows[i]?.cells[memberIndex]
    return cell && cell.length === 1 ? cell[0] : null
  }
  for (let i = 0; i < rows.length; i++) {
    const item = single(i)
    if (!item?.groupId) continue
    const below = single(i + 1)
    const above = single(i - 1)
    if (below?.groupId === item.groupId) state.set(item.itemId, { role: 'top', groupId: item.groupId })
    else if (above?.groupId === item.groupId) state.set(item.itemId, { role: 'bottom', groupId: item.groupId })
    else state.set(item.itemId, { role: 'apart', groupId: item.groupId })
  }
  return state
}

/** Whether a link may be offered on the seam below this cell. Requires both rows to hold exactly one
 *  item in this band AND those two to be genuine neighbours in that band's own sheet — a "pair" of
 *  rows that aren't adjacent in the sheet would draw no bracket there and confuse the editor, since
 *  every other consumer of group_id (the sheet, the PDF) is adjacency-based. */
function canLinkBelow(rows: CompareRow[], rowIndex: number, memberIndex: number): boolean {
  const here = rows[rowIndex]?.cells[memberIndex]
  const next = rows[rowIndex + 1]?.cells[memberIndex]
  if (here?.length !== 1 || next?.length !== 1) return false
  return Math.abs(here[0].sortOrder - next[0].sortOrder) === 1
}

/** Which patch fields actually differ across a row, so the cell sub-lines can name them instead of
 *  dumping all seven on every cell.
 *
 *  Returns nothing when a member is missing the row entirely (or has it twice). Every field would
 *  "differ" against an absent cell, and listing all seven would bury the actual story — which is
 *  that the row isn't there at all. */
function differingFieldKeys(row: CompareRow): Set<string> {
  const differing = new Set<string>()
  if (!row.cells.every((items) => items.length === 1)) return differing
  for (const field of PATCH_FIELDS) {
    const values = row.cells.map((items) => field.read(items[0]))
    if (!values.every((v) => v === values[0])) differing.add(field.key)
  }
  return differing
}

/** Sub-line under a cell: the differing fields, named so the difference is legible without opening
 *  both sheets. The mic is excluded — it has its own column now, and repeating it here would just
 *  restate what's directly above. Empty (and so not rendered) when only the mic differs. */
function patchSummary(item: MultiSetupComparisonItem, differing: Set<string>): string {
  const parts: string[] = []
  for (const field of PATCH_FIELDS) {
    if (field.key === 'mic' || !differing.has(field.key)) continue
    parts.push(`${field.label}: ${field.read(item) || '—'}`)
  }
  return parts.join(' · ')
}

/** Each member's own mic pool. Deliberately not catalogStore: that's a single-setup singleton that
 *  doesn't even retain a setupId, and loading a sibling's pool into it would clobber the open
 *  setup's out from under SetupEditor. Members of one Multi Setup share a studio, so the studio,
 *  building and personal pools are identical across columns — but the per-setup gear locker and the
 *  per-setup faculty-reserve flag are not, so each column really does need its own fetch. */
function useMemberMicPools(
  studioId: number | null,
  members: MultiSetupComparisonMember[]
): Map<number, Mic[]> {
  const [pools, setPools] = useState<Map<number, Mic[]>>(new Map())
  // Keyed on the setup ids and their faculty flags — the only inputs that change the result — so a
  // plain comparison refetch (a rename, an align) doesn't re-fetch every pool.
  const key = members.map((m) => `${m.setupId}:${m.facultyReserveEnabled}`).join(',')

  useEffect(() => {
    if (studioId == null || members.length === 0) return
    let cancelled = false
    Promise.all(
      members.map((m) =>
        window.api.mics
          .listAvailableForStudio(studioId, m.setupId, m.facultyReserveEnabled)
          .then((mics) => [m.setupId, mics] as const)
      )
    ).then((entries) => {
      if (!cancelled) setPools(new Map(entries))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId, key])

  return pools
}

/** Side-by-side view of every setup in a Multi Setup: the channels down the left, each band a
 *  column, so the engineer can see exactly what has to change between bands and fix the things that
 *  don't need to.
 *
 *  Each band's source name is editable in place. Copying a sheet for the next band and relabelling
 *  it is the common case (same room, same mics, different instruments), and doing it here — with
 *  the previous band's names in the next column — beats tabbing back and forth a row at a time. */
export default function MultiSetupComparePage({ multiSetupId, onBack }: Props): JSX.Element {
  const [data, setData] = useState<MultiSetupComparison | null>(null)
  const [changeoverOnly, setChangeoverOnly] = useState(false)
  const [didWrite, setDidWrite] = useState(false)
  const [openRowKey, setOpenRowKey] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ itemId: number; value: string } | null>(null)
  /** Same buffered-edit shape as `editing`, for the free-text mic field on Quick Setup studios.
   *  Buffered rather than write-per-change: the setup sheet routes its equivalent through
   *  useBufferedField, and an IPC round trip per keystroke would be far worse here, where the write
   *  is a targeted UPDATE rather than a local store mutation. */
  const [micEditing, setMicEditing] = useState<{ itemId: number; value: string } | null>(null)
  /** Set by Escape, read by the blur that Escape itself triggers. A ref, not state: blur() is
   *  called synchronously inside the keydown handler, so the blur listener still closes over the
   *  pre-Escape render and would otherwise commit the very edit being cancelled. */
  const cancelEditRef = useRef(false)

  const close = useCallback(() => onBack(didWrite), [onBack, didWrite])
  useEscapeToClose(close)

  const refetch = useCallback(() => {
    window.api.multiSetups.getComparison(multiSetupId).then(setData)
  }, [multiSetupId])

  useEffect(refetch, [refetch])

  const members = data?.members ?? []
  const micPools = useMemberMicPools(data?.multiSetup.studioId ?? null, members)
  const gearSuggestions = useGearCatalogueSuggestions()
  const micSuggestions = useMemo(
    () => [
      ...new Set(gearSuggestions.mics.map((m) => (m.manufacturer ? `${m.manufacturer} ${m.name}` : m.name)))
    ].sort((a, b) => a.localeCompare(b)),
    [gearSuggestions.mics]
  )
  // Capacity is per sheet, so each column counts its own band's usage — a mic fully booked in one
  // band says nothing about whether the next band can use it.
  const micUsageByMember = useMemo(
    () => new Map(members.map((m) => [m.setupId, computeUsageCounts(m.items, 'micId')])),
    [members]
  )
  const rows = useMemo(() => buildRows(members), [members])
  const visibleRows = useMemo(
    () => (changeoverOnly ? rows.filter((r) => r.status === 'changed') : rows),
    [rows, changeoverOnly]
  )
  // Derived from the VISIBLE rows: with "Changeover only" on, a pair whose halves aren't both shown
  // is no longer adjacent on screen, and drawing a bracket across the gap would be a lie.
  const linkStates = useMemo(
    () => members.map((_, i) => buildLinkState(visibleRows, i)),
    [visibleRows, members]
  )
  const changedCount = rows.filter((r) => r.status === 'changed').length
  const renamedCount = rows.filter((r) => r.status === 'renamed').length

  async function align(row: CompareRow, referenceIndex: number): Promise<void> {
    const reference = row.cells[referenceIndex][0]
    if (!reference) return
    await window.api.multiSetups.alignRow({ multiSetupId, referenceItemId: reference.itemId })
    setDidWrite(true)
    setOpenRowKey(null)
    refetch()
  }

  /** Picks a catalog mic for one band's row. Keeps the row's gear-pool notes tag in step exactly as
   *  the setup sheet does, so a mic chosen here is indistinguishable from one chosen there. */
  async function selectMic(item: MultiSetupComparisonItem, setupId: number, micId: number | null): Promise<void> {
    const mic = micId != null ? (micPools.get(setupId) ?? []).find((m) => m.id === micId) ?? null : null
    const notes = applyMicPoolNotesTag(item.notes ?? '', mic?.poolType ?? null)
    // micText is cleared, not left behind: display is id-first, so a stale free-text mic would hide
    // until this mic was cleared and then reappear as an "Unresolved" badge on the sheet.
    await window.api.multiSetups.setItemMic(item.itemId, micId, null, notes || null)
    setDidWrite(true)
    refetch()
  }

  /** Commits the free-text mic, for Quick Setup studios that have no catalog to pick from. With no
   *  catalog there is never a micId, so micLabel is the raw free text. */
  async function commitMicText(item: MultiSetupComparisonItem): Promise<void> {
    const next = micEditing?.itemId === item.itemId ? micEditing.value.trim() : null
    setMicEditing(null)
    if (next == null || next === (item.micLabel ?? '')) return
    await window.api.multiSetups.setItemMic(item.itemId, null, next || null, item.notes)
    setDidWrite(true)
    refetch()
  }

  /** Links the two rows either side of a seam into a stereo pair, or dissolves the pair that's
   *  already there. Group ids are generated the same way the setup sheet generates them. */
  async function toggleLink(
    rowIndex: number,
    memberIndex: number,
    existing: CellLink | undefined
  ): Promise<void> {
    const setupId = members[memberIndex].setupId
    if (existing) {
      await window.api.multiSetups.unlinkGroup(setupId, existing.groupId)
    } else {
      const top = visibleRows[rowIndex].cells[memberIndex][0]
      const bottom = visibleRows[rowIndex + 1].cells[memberIndex][0]
      await window.api.multiSetups.linkItems([top.itemId, bottom.itemId], crypto.randomUUID())
    }
    setDidWrite(true)
    refetch()
  }

  /** Commits an in-place source rename. Marking didWrite matters even for a sibling band's row:
   *  closeCompare reloads the open setup on the way out, and without that a rename to the OPEN
   *  setup would be silently undone by setupStore's next autosave pushing its stale item list back. */
  async function commitRename(item: MultiSetupComparisonItem): Promise<void> {
    if (cancelEditRef.current) {
      cancelEditRef.current = false
      setEditing(null)
      return
    }
    const next = editing?.itemId === item.itemId ? editing.value : null
    setEditing(null)
    if (next == null || next === item.sourceName) return
    await window.api.multiSetups.renameItemSource(item.itemId, next)
    setDidWrite(true)
    refetch()
  }

  if (!data) {
    return (
      <div className="page">
        <div className="empty-state">Loading…</div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="nav-crumbs">
        <button onClick={close}>Setup Editor</button> / Compare
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2>{data.multiSetup.name}</h2>
        <button className="btn" onClick={close}>
          Close
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <ToggleSwitch checked={changeoverOnly} onChange={setChangeoverOnly} label="Changeover only" />
        <span className="card-sub">
          {changedCount} of {rows.length} rows need changeover
          {renamedCount > 0 && ` · ${renamedCount} renamed only`}
        </span>
      </div>

      <div className="panel" style={{ marginTop: 16, overflowX: 'auto' }}>
        {visibleRows.length === 0 ? (
          <div className="empty-state">
            {rows.length === 0 ? 'Nothing to compare yet.' : 'No changeover work — every channel is patched the same.'}
          </div>
        ) : (
          <table className="compare-table compare-table-split">
            <thead>
              {/* Two header rows: the band name spans its Source and Mic pair, so the grouping is
                  legible without a colour or a border trick. */}
              <tr>
                <th rowSpan={2}>Channel</th>
                {members.map((m) => (
                  <th key={m.setupId} colSpan={2} className="compare-band-start">
                    {m.name}
                  </th>
                ))}
                <th rowSpan={2} />
              </tr>
              <tr>
                {members.map((m) => (
                  <Fragment key={m.setupId}>
                    <th className="compare-band-start compare-subhead">Source</th>
                    <th className="compare-subhead">Mic</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => {
                const differing = differingFieldKeys(row)
                const startsUnassigned =
                  row.group === 'unassigned' && visibleRows[rowIndex - 1]?.group !== 'unassigned'
                return (
                  <Fragment key={row.key}>
                    {startsUnassigned && (
                      <tr className="compare-section-row">
                        <td colSpan={2 + members.length * 2}>
                          No channel yet — matched up in sheet order
                        </td>
                      </tr>
                    )}
                  <tr className={`compare-row ${row.status}`}>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: row.status === 'changed' ? 600 : 400 }}>
                      {row.label}
                    </td>
                    {row.cells.map((items, i) => {
                      const link = items.length === 1 ? linkStates[i]?.get(items[0].itemId) : undefined
                      const seamLinked = link?.role === 'top'
                      // Every row but the last hosts the seam control for the gap below it, exactly
                      // as the setup sheet does. Offered only where a link would be meaningful in
                      // this band's own sheet.
                      const seamOffered =
                        rowIndex < visibleRows.length - 1 && (seamLinked || canLinkBelow(visibleRows, rowIndex, i))
                      return (
                      <Fragment key={members[i].setupId}>
                        <td
                          className="compare-band-start compare-link-cell"
                          style={{ zIndex: seamOffered ? visibleRows.length - rowIndex : undefined }}
                        >
                          {link && link.role !== 'apart' && (
                            <div
                              aria-hidden="true"
                              className={`compare-bracket compare-bracket-${link.role}`}
                            />
                          )}
                          {link?.role === 'apart' && (
                            <Link2
                              className="compare-link-apart"
                              size={11}
                              aria-label="Linked to a row that isn't next to it here"
                            />
                          )}
                          {seamOffered && (
                            <button
                              type="button"
                              className={`compare-seam-btn${seamLinked ? ' linked' : ''}`}
                              aria-label={
                                seamLinked
                                  ? `Linked stereo pair in ${members[i].name} — click to unlink`
                                  : `Link with the row below as a stereo pair in ${members[i].name}`
                              }
                              onClick={() => toggleLink(rowIndex, i, seamLinked ? link : undefined)}
                            >
                              <Link2 size={12} aria-hidden="true" />
                            </button>
                          )}
                          {items.length === 0 ? (
                            <span className="compare-cell-absent">—</span>
                          ) : (
                            items.map((item) => (
                              <span key={item.itemId} style={{ display: 'block' }}>
                                <input
                                  className="compare-name-input"
                                  aria-label={`Source name on ${row.label} in ${members[i].name}`}
                                  value={editing?.itemId === item.itemId ? editing.value : item.sourceName}
                                  onChange={(e) => setEditing({ itemId: item.itemId, value: e.target.value })}
                                  onFocus={() => setEditing({ itemId: item.itemId, value: item.sourceName })}
                                  onBlur={() => commitRename(item)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.currentTarget.blur()
                                    } else if (e.key === 'Escape') {
                                      // Stops the page's own Escape-to-close from firing too —
                                      // cancelling an edit shouldn't also exit Compare.
                                      e.preventDefault()
                                      e.stopPropagation()
                                      cancelEditRef.current = true
                                      setEditing(null)
                                      e.currentTarget.blur()
                                    }
                                  }}
                                />
                                {(() => {
                                  const summary = patchSummary(item, differing)
                                  return summary ? <span className="compare-cell-sub">{summary}</span> : null
                                })()}
                              </span>
                            ))
                          )}
                        </td>
                        <td>
                          {items.length === 0 ? (
                            <span className="compare-cell-absent">—</span>
                          ) : (
                            items.map((item) => (
                              <span key={item.itemId} style={{ display: 'block' }}>
                                {data.studioIsTemporary ? (
                                  <SuggestInput
                                    value={micEditing?.itemId === item.itemId ? micEditing.value : item.micLabel ?? ''}
                                    placeholder="Mic"
                                    onChange={(v) => setMicEditing({ itemId: item.itemId, value: v })}
                                    onBlur={() => commitMicText(item)}
                                    suggestions={micSuggestions}
                                  />
                                ) : (
                                  <ManufacturerPickerDropdown
                                    items={micPools.get(members[i].setupId) ?? []}
                                    usageCounts={micUsageByMember.get(members[i].setupId) ?? EMPTY_USAGE}
                                    getQuantity={micQuantity}
                                    selectedId={item.micId}
                                    onSelect={(micId) => selectMic(item, members[i].setupId, micId)}
                                    outerGroupBy={micGroupBy}
                                    outerGroupOrder={POOL_ORDER}
                                    clearLabel="No Mic"
                                  />
                                )}
                              </span>
                            ))
                          )}
                        </td>
                      </Fragment>
                      )
                    })}
                    <td style={{ position: 'relative', whiteSpace: 'nowrap' }}>
                      {/* Match copies a reference row onto the rows at the SAME CHANNEL in the other
                          bands, so it has nothing to aim at when there's no channel. Those rows are
                          fixed by editing the mic in place instead. */}
                      {row.status === 'changed' && row.group === 'channel' && (
                        <button
                          className="btn small"
                          onClick={() => setOpenRowKey(openRowKey === row.key ? null : row.key)}
                        >
                          Fix…
                        </button>
                      )}
                      {openRowKey === row.key && (
                        <div
                          className="picker-menu"
                          style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, minWidth: 200, zIndex: 5 }}
                        >
                          {row.cells.map((items, i) =>
                            items.length === 1 ? (
                              <div key={members[i].setupId} className="picker-menu-row" onClick={() => align(row, i)}>
                                Match {members[i].name}
                              </div>
                            ) : null
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
        {rows.length > 0 && (
          <div className="card-sub" style={{ marginTop: 10 }}>
            Names and mics are editable here — &ldquo;Match&rdquo; only ever copies the patch, never the name.
          </div>
        )}
      </div>
    </div>
  )
}
