import type { Mic, OutboardGear, Preamp } from '@shared/types/entities'
import type { SetupItemOutboardSlot } from '@shared/types/setup'
import { stripManufacturerPrefix } from '@shared/utils/manufacturerPrefix'

/** Resolve-or-fallback-to-free-text rules shared by every export format that needs a display
 *  string for a row's gear (PDF, spreadsheet, ...). Each of these is a straight lift of logic
 *  that used to live inline in exportSetupPdf.ts — kept as three small atomic resolvers rather
 *  than one combined "resolve a whole row" function, since PDF and spreadsheet diverge on what
 *  they DO with the resolved per-slot outboard text (PDF joins every slot into one comma-joined
 *  cell; the spreadsheet keeps each slot as its own column) — that consolidation step is real,
 *  format-specific logic, not incidental duplication, so it stays in each exporter. */

/** Mic display text: unlike preamp/outboard below, the catalog name is used as-is — no
 *  manufacturer-prefix stripping. Matches the table's own mic column and the PDF's prior inline
 *  behavior exactly. */
export function resolveMicText(item: { micId: number | null; micText: string | null }, micById: Map<number, Mic>): string {
  const mic = item.micId != null ? micById.get(item.micId) ?? null : null
  return mic ? mic.name : item.micText ?? ''
}

export function resolvePreampText(
  item: { preampId: number | null; preampText: string | null },
  preampById: Map<number, Preamp>
): string {
  const preamp = item.preampId != null ? preampById.get(item.preampId) ?? null : null
  return preamp ? stripManufacturerPrefix(preamp.name, preamp.manufacturer ?? '') : item.preampText ?? ''
}

export function resolveOutboardSlotText(slot: SetupItemOutboardSlot, outboardById: Map<number, OutboardGear>): string {
  const outboard = slot.outboardId != null ? outboardById.get(slot.outboardId) ?? null : null
  return outboard ? stripManufacturerPrefix(outboard.name, outboard.manufacturer ?? '') : slot.outboardText ?? ''
}
