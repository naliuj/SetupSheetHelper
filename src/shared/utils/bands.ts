/** Several bands in one setup sheet. A band starts at a divider row (instrumentType
 *  BAND_DIVIDER: sourceName is the band name, notes the band notes, startTime its start time) and
 *  runs to the next divider. A sheet with no dividers is one band, exactly as before bands existed.
 *
 *  "Next band" copies the last band's rows below a new divider. Each copy shares its source row's
 *  copyKey, which is how a later band's row knows which earlier row it is (bandChanges,
 *  laterMatches) even after a rename, a channel change or a drag.
 *
 *  Changeover is the patch and only the patch (PATCH_FIELDS): renaming a source on the same mic
 *  and channel is shown but costs no changeover work, the rule the retired Multi Setup's Compare
 *  settled on. Pure functions, shared by the renderer and main's PDF export so both read the same
 *  way; scripts/check_bands.mjs tests them. */

import type { SetupItemOutboardSlot } from '../types/setup'
import type { SetupColumnKey } from '../constants/setupColumns'

export const BAND_DIVIDER = 'band_divider'

export interface BandItem {
  id: number | string
  instrumentType: string
  sourceName: string
  micId: number | null
  micText: string | null
  phantomPower: boolean
  channel: number | null
  tieLine: string | null
  cueBox: string | null
  outboards: SetupItemOutboardSlot[]
  preampId: number | null
  preampText: string | null
  polarityFlip: boolean
  groupId: string | null
  copyKey: string | null
}

export function isBandDivider(item: Pick<BandItem, 'instrumentType'>): boolean {
  return item.instrumentType === BAND_DIVIDER
}

export function hasBands(items: Array<Pick<BandItem, 'instrumentType'>>): boolean {
  return items.some(isBandDivider)
}

export interface BandRange<T> {
  /** 0-based band number. */
  index: number
  /** Null only for a sheet without dividers (or rows above the first divider). */
  divider: T | null
  /** The band's rows, divider excluded: items.slice(start, end). */
  start: number
  end: number
}

/** The sheet's bands in order. Always at least one, even for an empty sheet. */
export function bandRanges<T extends Pick<BandItem, 'instrumentType'>>(items: T[]): BandRange<T>[] {
  const ranges: BandRange<T>[] = []
  let current: BandRange<T> = { index: 0, divider: null, start: 0, end: 0 }
  items.forEach((item, i) => {
    if (!isBandDivider(item)) return
    current.end = i
    // Rows above the first divider would be an unnamed band 0; a sheet with bands starts with a
    // divider, so that band is normally empty and is dropped.
    if (current.divider != null || current.end > current.start) ranges.push(current)
    current = { index: ranges.length, divider: item, start: i + 1, end: i + 1 }
  })
  current.end = items.length
  ranges.push(current)
  return ranges
}

/** Band number for every row, divider rows included (a divider belongs to the band it starts). */
export function bandIndexes<T extends Pick<BandItem, 'instrumentType'>>(items: T[]): number[] {
  const out = new Array<number>(items.length)
  for (const range of bandRanges(items)) {
    if (range.divider) out[range.start - 1] = range.index
    for (let i = range.start; i < range.end; i++) out[i] = range.index
  }
  return out
}

/** Appends the next band: a divider named "Band N" and a copy of the last band's rows. A sheet
 *  without dividers first gets a "Band 1" divider on top. Source rows without a copyKey get one,
 *  shared with their copy; each copied stereo pair gets a fresh groupId so it isn't linked to the
 *  band above. Returns the new list and the new divider's id. */
export function appendNextBand<T extends BandItem>(
  items: T[],
  makeDivider: (name: string) => T,
  copy: (item: T, groupId: string | null, copyKey: string) => T,
  newKey: () => string
): { items: T[]; dividerId: T['id'] } {
  let next = hasBands(items) ? [...items] : [makeDivider('Band 1'), ...items]
  const ranges = bandRanges(next)
  const last = ranges[ranges.length - 1]

  next = next.map((item, i) =>
    i >= last.start && i < last.end && item.copyKey == null ? { ...item, copyKey: newKey() } : item
  )
  const freshGroupIds = new Map<string, string>()
  const copies = next.slice(last.start, last.end).map((item) => {
    let groupId: string | null = null
    if (item.groupId != null) {
      groupId = freshGroupIds.get(item.groupId) ?? newKey()
      freshGroupIds.set(item.groupId, groupId)
    }
    return copy(item, groupId, item.copyKey as string)
  })
  const divider = makeDivider(`Band ${ranges.length + 1}`)
  return { items: [...next, divider, ...copies], dividerId: divider.id }
}

/** What has to be physically re-patched between bands. 'mic' and 'preamp' compare the id and the
 *  typed text together; 'outboards' compares the filled slots. */
export type PatchField =
  | 'channel'
  | 'tieLine'
  | 'cueBox'
  | 'mic'
  | 'preamp'
  | 'phantomPower'
  | 'polarityFlip'
  | 'outboards'

export const PATCH_FIELDS: readonly PatchField[] = [
  'channel',
  'tieLine',
  'cueBox',
  'mic',
  'preamp',
  'phantomPower',
  'polarityFlip',
  'outboards'
]

/** A comparable value for one patch field. Empty text and null are the same. */
export function patchValue(item: BandItem, field: PatchField): string {
  switch (field) {
    case 'channel':
      return item.channel == null ? '' : String(item.channel)
    case 'tieLine':
      return item.tieLine?.trim() ?? ''
    case 'cueBox':
      return item.cueBox?.trim() ?? ''
    case 'mic':
      return item.micId != null ? `#${item.micId}` : (item.micText?.trim() ?? '')
    case 'preamp':
      return item.preampId != null ? `#${item.preampId}` : (item.preampText?.trim() ?? '')
    case 'phantomPower':
      return item.phantomPower ? '1' : ''
    case 'polarityFlip':
      return item.polarityFlip ? '1' : ''
    case 'outboards':
      return item.outboards
        .filter((slot) => slot.outboardId != null || slot.outboardText?.trim())
        .sort((a, b) => a.slotIndex - b.slotIndex)
        .map((slot) => `${slot.slotIndex}:${slot.outboardId != null ? `#${slot.outboardId}` : slot.outboardText?.trim()}`)
        .join('|')
  }
}

export type RowChangeStatus = 'same' | 'renamed' | 'changed' | 'new'

export interface RowChange<T> {
  item: T
  status: RowChangeStatus
  /** The matching row in the band before, by copyKey. Null for 'new'. */
  previous: T | null
  /** The patch fields that differ ('changed' only). */
  fields: PatchField[]
}

export interface BandChanges<T> {
  rows: RowChange<T>[]
  /** Rows of the band before with no match in this band. */
  removed: T[]
}

/** Compares a band with the band before it (both without their dividers). */
export function bandChanges<T extends BandItem>(previousBand: T[], band: T[]): BandChanges<T> {
  const byKey = new Map<string, T>()
  for (const item of previousBand) {
    if (item.copyKey != null && !byKey.has(item.copyKey)) byKey.set(item.copyKey, item)
  }
  const matched = new Set<T>()
  const rows = band.map((item): RowChange<T> => {
    const previous = item.copyKey != null ? (byKey.get(item.copyKey) ?? null) : null
    if (!previous || matched.has(previous)) return { item, status: 'new', previous: null, fields: [] }
    matched.add(previous)
    const fields = PATCH_FIELDS.filter((f) => patchValue(item, f) !== patchValue(previous, f))
    const status: RowChangeStatus =
      fields.length > 0 ? 'changed' : item.sourceName.trim() !== previous.sourceName.trim() ? 'renamed' : 'same'
    return { item, status, previous, fields }
  })
  return { rows, removed: previousBand.filter((item) => !matched.has(item)) }
}

/** Changes for every band after the first, keyed by band index. */
export function allBandChanges<T extends BandItem>(items: T[]): Map<number, BandChanges<T>> {
  const ranges = bandRanges(items)
  const out = new Map<number, BandChanges<T>>()
  for (let i = 1; i < ranges.length; i++) {
    const prev = ranges[i - 1]
    const band = ranges[i]
    out.set(i, bandChanges(items.slice(prev.start, prev.end), items.slice(band.start, band.end)))
  }
  return out
}

/** Every row's change from the band before, by row id. Rows of the first band have no entry. */
export function rowChanges<T extends BandItem>(items: T[]): Map<T['id'], RowChange<T>> {
  const out = new Map<T['id'], RowChange<T>>()
  for (const changes of allBandChanges(items).values()) {
    for (const change of changes.rows) out.set(change.item.id, change)
  }
  return out
}

/** The table and export column each patch field shows in. */
export const FIELD_COLUMN: Record<PatchField, SetupColumnKey> = {
  channel: 'channel',
  tieLine: 'tieLine',
  cueBox: 'cueBox',
  mic: 'mic',
  preamp: 'preamp',
  phantomPower: 'phantomPower',
  polarityFlip: 'polarity',
  outboards: 'outboard'
}

/** The outboard slot indexes whose contents differ between a row and its match in the band
 *  before, so only those outboard cells are marked. */
export function changedOutboardSlots(item: BandItem, previous: BandItem): number[] {
  const slotValue = (row: BandItem, index: number): string => {
    const slot = row.outboards.find((s) => s.slotIndex === index)
    if (!slot) return ''
    return slot.outboardId != null ? `#${slot.outboardId}` : (slot.outboardText?.trim() ?? '')
  }
  const indexes = new Set([...item.outboards, ...previous.outboards].map((s) => s.slotIndex))
  return [...indexes].filter((i) => slotValue(item, i) !== slotValue(previous, i)).sort((a, b) => a - b)
}

/** Rows in bands after `row`'s band that match it by copyKey and still hold the value `before`
 *  had for `field`, i.e. the rows an edit to `row` could be carried into. `items` is the sheet
 *  after the edit; `before` is the edited row as it was. */
export function laterMatches<T extends BandItem>(items: T[], row: T, before: T, field: PatchField): T[] {
  if (row.copyKey == null) return []
  const bands = bandIndexes(items)
  const rowIndex = items.findIndex((item) => item.id === row.id)
  if (rowIndex === -1) return []
  const oldValue = patchValue(before, field)
  return items.filter(
    (item, i) =>
      bands[i] > bands[rowIndex] &&
      !isBandDivider(item) &&
      item.copyKey === row.copyKey &&
      patchValue(item, field) === oldValue
  )
}

/** Display names for the gear on a row, resolved by the caller (the renderer from its catalog,
 *  main from the database). Null or '' means none. */
export interface GearNames<T> {
  mic(item: T): string | null
  preamp(item: T): string | null
  outboards(item: T): string | null
}

const FIELD_LABELS: Record<PatchField, string> = {
  channel: 'channel',
  tieLine: 'tie line',
  cueBox: 'cue',
  mic: 'mic',
  preamp: 'preamp',
  phantomPower: '48V',
  polarityFlip: 'polarity flip',
  outboards: 'outboard'
}

function shown<T extends BandItem>(item: T, field: PatchField, names: GearNames<T>): string {
  switch (field) {
    case 'mic':
      return names.mic(item) || 'none'
    case 'preamp':
      return names.preamp(item) || 'none'
    case 'outboards':
      return names.outboards(item) || 'none'
    case 'phantomPower':
      return item.phantomPower ? 'on' : 'off'
    case 'polarityFlip':
      return item.polarityFlip ? 'on' : 'off'
    default:
      return patchValue(item, field) || 'none'
  }
}

/** "Fiddle (ch 3)", or "Unnamed row" for a blank source with no channel. */
export function rowLabel(item: Pick<BandItem, 'sourceName' | 'channel'>): string {
  const name = item.sourceName.trim()
  const channel = item.channel != null ? `ch ${item.channel}` : ''
  if (name && channel) return `${name} (${channel})`
  return name || (channel ? channel.replace('ch', 'Ch') : 'Unnamed row')
}

/** One changed row in words: "Fiddle (ch 3): mic KM184 → SM81; 48V off → on". */
export function describeRowChange<T extends BandItem>(change: RowChange<T>, names: GearNames<T>): string {
  const parts = change.fields.map((field) => {
    if (field === 'phantomPower' || field === 'polarityFlip') {
      return `${FIELD_LABELS[field]} ${shown(change.item, field, names)}`
    }
    return `${FIELD_LABELS[field]} ${change.previous ? shown(change.previous, field, names) : 'none'} → ${shown(change.item, field, names)}`
  })
  return `${rowLabel(change.item)}: ${parts.join('; ')}`
}

function describeAdded<T extends BandItem>(item: T, names: GearNames<T>): string {
  const gear = [names.mic(item), item.tieLine?.trim() ? `TL ${item.tieLine.trim()}` : null]
    .filter((part): part is string => !!part)
    .join(', ')
  return `Add ${rowLabel(item)}${gear ? `: ${gear}` : ''}`
}

/** The changeover list between a band and the one before it, as the panel and the printed page
 *  show it. Renamed-only rows are left out: they cost no changeover work. */
export function describeBandChanges<T extends BandItem>(
  changes: BandChanges<T>,
  names: GearNames<T>
): { changed: string[]; added: string[]; removed: string[] } {
  return {
    changed: changes.rows.filter((r) => r.status === 'changed').map((r) => describeRowChange(r, names)),
    added: changes.rows.filter((r) => r.status === 'new').map((r) => describeAdded(r.item, names)),
    removed: changes.removed.map((item) => `Remove ${rowLabel(item)}`)
  }
}

/** How many changeover moves a band needs: changed + new + removed rows. */
export function changeCount<T extends BandItem>(changes: BandChanges<T>): number {
  return changes.rows.filter((r) => r.status === 'changed' || r.status === 'new').length + changes.removed.length
}
