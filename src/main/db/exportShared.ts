import type { Mic, OutboardGear, Preamp } from '@shared/types/entities'
import type { SetupItem } from '@shared/types/setup'
import { buildPatchCableRows, type PatchCableRow } from '@shared/utils/patchCableRows'
import { FIELD_COLUMN, allBandChanges, bandRanges, changedOutboardSlots, rowLabel } from '@shared/utils/bands'
import { getMicsByIds } from './repositories/micsRepo'
import { getOutboardByIds } from './repositories/outboardRepo'
import { getPreampsByIds } from './repositories/preampRepo'
import { listCablesBySetup } from './repositories/patchbayCablesRepo'
import { getPatchbayWithPoints } from '../pdf/importPatchbay'
import { resolveOutboardSlotText } from './resolveGearLabels'

/** The save dialog's suggested file name, without the extension. Strips only what a path can't
 *  hold (separators, `:` and control characters), so "Ensemble Café" or a name in another script
 *  keeps its letters instead of collapsing to an empty name. */
export function exportFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[/\\:\u0000-\u001f\u007f]/g, '').trim() || 'Setup'
}

export interface SetupGear {
  micById: Map<number, Mic>
  preampById: Map<number, Preamp>
  outboardById: Map<number, OutboardGear>
}

/** Every piece of gear the setup references, in one IN() query per gear type rather than one
 *  query per row or slot (an N+1 that hit ~200 queries on a large sheet). */
export function loadSetupGear(items: SetupItem[]): SetupGear {
  return {
    micById: getMicsByIds(items.flatMap((item) => (item.micId != null ? [item.micId] : []))),
    preampById: getPreampsByIds(items.flatMap((item) => (item.preampId != null ? [item.preampId] : []))),
    outboardById: getOutboardByIds(
      items.flatMap((item) => item.outboards.flatMap((s) => (s.outboardId != null ? [s.outboardId] : [])))
    )
  }
}

/** One display string per outboard slot, in slot order, '' for an empty slot. */
export function outboardSlotTexts(
  item: SetupItem,
  slotCount: number,
  outboardById: Map<number, OutboardGear>
): string[] {
  return Array.from({ length: slotCount }, (_, i) =>
    resolveOutboardSlotText(
      item.outboards.find((s) => s.slotIndex === i) ?? { slotIndex: i, outboardId: null, outboardText: null },
      outboardById
    )
  )
}

/** The bytes of a renderer capture sent as a `data:image/png;base64,` URL. */
export function pngBytesFromDataUrl(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
}

/** The setup's cables as listed rows. The names come from the same resolver the editor's tooltip
 *  uses, over the drawing's cached jacks, so the list says what hovering each cable said. */
export async function loadPatchCableRows(setup: { id: number; studioId: number }): Promise<PatchCableRow[]> {
  const patchbay = await getPatchbayWithPoints(setup.studioId)
  return buildPatchCableRows(listCablesBySetup(setup.id), patchbay?.points ?? [])
}

/** A band divider's heading in both exports: "Late set · 9:30 pm", or "Band 2" for a divider left
 *  unnamed. Notes are not part of it; each export lays them out under the heading. */
export function bandTitle(divider: Pick<SetupItem, 'sourceName' | 'startTime'>, bandIndex: number): string {
  const name = divider.sourceName.trim() || `Band ${bandIndex + 1}`
  const time = divider.startTime?.trim()
  return time ? `${name} \u00b7 ${time}` : name
}

/** What both exports mark when "Mark changes between bands" is on, against the band before. */
export interface BandChangeMarks {
  /** Row id -> the column keys to mark: SetupColumnKeys, plus `outboard:N` for each changed slot
   *  (the PDF's single Outboard column looks for 'outboard', the spreadsheet's per-slot ones for
   *  `outboard:N`). A renamed row marks 'sourceName'. */
  cells: Map<number, Set<string>>
  /** Rows with no match in the band before, whose source name gets "+ ". */
  newRows: Set<number>
  /** Changed or renamed row id -> its match in the band before, for the PDF's struck-through old
   *  values. */
  previous: Map<number, SetupItem>
  /** Item id -> the italic line printed right after it: "Removed: OH R (ch 3) · * changed from
   *  Jazz Trio". Keyed by a band's last row, or its divider when the band has no rows. */
  notes: Map<number, string>
}

export function bandChangeMarks(items: SetupItem[]): BandChangeMarks {
  const ranges = bandRanges(items)
  const marks: BandChangeMarks = { cells: new Map(), newRows: new Set(), previous: new Map(), notes: new Map() }
  for (const [index, changes] of allBandChanges(items)) {
    for (const { item, status, previous, fields, renamed } of changes.rows) {
      if (status === 'new') marks.newRows.add(item.id)
      if ((status !== 'changed' && status !== 'renamed') || !previous) continue
      const keys = new Set<string>(fields.map((field) => FIELD_COLUMN[field]))
      if (renamed) keys.add('sourceName')
      if (fields.includes('outboards')) {
        for (const slot of changedOutboardSlots(item, previous)) keys.add(`outboard:${slot}`)
      }
      marks.cells.set(item.id, keys)
      marks.previous.set(item.id, previous)
    }
    const prev = ranges[index - 1]
    const parts: string[] = []
    if (changes.removed.length > 0) parts.push(`Removed: ${changes.removed.map(rowLabel).join(', ')}`)
    if (changes.rows.some((row) => row.status === 'changed' || row.status === 'renamed')) {
      const prevName = prev.divider ? bandTitle({ ...prev.divider, startTime: null }, prev.index) : `Band ${prev.index + 1}`
      parts.push(`* changed from ${prevName}`)
    }
    const band = ranges[index]
    if (parts.length > 0) marks.notes.set(items[band.end > band.start ? band.end - 1 : band.start - 1].id, parts.join(' \u00b7 '))
  }
  return marks
}

/** A marked cell's text: " *" after it, or "*" alone in a cell that is now empty. */
export function withChangeMark(text: string): string {
  return text ? `${text} *` : '*'
}
