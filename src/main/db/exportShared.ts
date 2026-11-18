import type { Mic, OutboardGear, Preamp } from '@shared/types/entities'
import type { SetupItem } from '@shared/types/setup'
import { buildPatchCableRows, type PatchCableRow } from '@shared/utils/patchCableRows'
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
