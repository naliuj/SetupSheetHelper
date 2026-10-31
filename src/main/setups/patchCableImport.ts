import type { ExportedPatchbaySource, ExportedPatchCable } from '@shared/types/ipc'
import { DEFAULT_CABLE_COLOR, DEFAULT_CABLE_SAG } from '@shared/constants/patchCables'

/** Far past any real drawing (a 100-inch page is 14,400 room pixels), close enough that a hostile
 *  file can't hand the canvas or the PDF export a cable spanning a billion pixels. */
const MAX_COORDINATE = 1_000_000

const HEX_COLOR = /^#[0-9a-f]{6}$/i
/** A jack id as detection writes it: `<row index>:<column index>` (see PatchPoint.id). */
const POINT_ID = /^\d+:\d+$/

function coordinate(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE ? value : null
}

function pointId(value: unknown): string | null {
  return typeof value === 'string' && POINT_ID.test(value) ? value : null
}

/** Setup files are shared between people, so their cables are untrusted input. A cable without four
 *  usable end coordinates is dropped; everything else falls back to a safe value rather than
 *  losing the cable: an unknown color becomes the default, a malformed jack id becomes a free end
 *  (the coordinates still place it), and sag is clamped to the 0–1 the editor draws. */
export function sanitizePatchCables(raw: unknown): ExportedPatchCable[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry: unknown, index): ExportedPatchCable[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const cable = entry as Record<string, unknown>
    const fromX = coordinate(cable.fromX)
    const fromY = coordinate(cable.fromY)
    const toX = coordinate(cable.toX)
    const toY = coordinate(cable.toY)
    if (fromX == null || fromY == null || toX == null || toY == null) return []
    const sag = typeof cable.sag === 'number' && Number.isFinite(cable.sag) ? cable.sag : DEFAULT_CABLE_SAG
    return [
      {
        fromX,
        fromY,
        toX,
        toY,
        fromPoint: pointId(cable.fromPoint),
        toPoint: pointId(cable.toPoint),
        color: typeof cable.color === 'string' && HEX_COLOR.test(cable.color) ? cable.color : DEFAULT_CABLE_COLOR,
        sag: Math.min(1, Math.max(0, sag)),
        zIndex: Number.isInteger(cable.zIndex) ? (cable.zIndex as number) : index
      }
    ]
  })
}

/** The drawing a file's cables were made on, or null when it's missing or not a real page size —
 *  it only feeds the "may not line up" warning, so a bad value just means no warning. */
export function sanitizePatchbaySource(raw: unknown): ExportedPatchbaySource | null {
  if (typeof raw !== 'object' || raw === null) return null
  const source = raw as Record<string, unknown>
  const { pageWidthPt, pageHeightPt } = source
  if (typeof pageWidthPt !== 'number' || !Number.isFinite(pageWidthPt) || pageWidthPt <= 0) return null
  if (typeof pageHeightPt !== 'number' || !Number.isFinite(pageHeightPt) || pageHeightPt <= 0) return null
  return {
    originalName: typeof source.originalName === 'string' ? source.originalName : null,
    pageWidthPt,
    pageHeightPt
  }
}
