import type { ExportedLayoutBlock } from '@shared/types/ipc'
import type { MarkData, MarkTool } from '@shared/types/setup'
import { isHexColor } from '@shared/constants/swatches'
import { NOTE_NO_FILL } from '@shared/constants/layoutNotes'

/** Same bound as patch cable ends (see patchCableImport): far past any real room, close enough that
 *  a hostile file can't hand the canvas or the PDF export a block a billion pixels wide. */
const MAX_COORDINATE = 1_000_000
/** Room pixels; a pen stroke of a few thousand points is already a long one. */
const MAX_MARK_POINTS = 200_000

const KINDS = new Set<ExportedLayoutBlock['kind']>(['block', 'note', 'mark'])
const SHAPES = new Set<ExportedLayoutBlock['shape']>(['rect', 'circle'])
const MARK_TOOLS = new Set<MarkTool>(['pen', 'highlighter', 'line', 'arrow', 'ellipse', 'rect'])

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE ? value : null
}

function markData(raw: unknown): MarkData | null {
  if (typeof raw !== 'object' || raw === null) return null
  const mark = raw as Record<string, unknown>
  const size = finite(mark.size)
  if (!MARK_TOOLS.has(mark.tool as MarkTool) || !isHexColor(mark.color as string) || size == null) return null
  const { points } = mark
  if (!Array.isArray(points) || points.length > MAX_MARK_POINTS || !points.every((p) => finite(p) != null)) {
    return null
  }
  return { tool: mark.tool as MarkTool, color: mark.color as string, size, points: points as number[] }
}

/** Setup files are shared between people, so their Layout Mode content is untrusted input, written
 *  straight into room_layout_blocks and drawn by Konva. A block whose geometry, kind, shape or fill
 *  isn't usable is dropped, and so is a mark without a usable drawing (it would render as nothing).
 *  Optional extras (person name, label color, font size) fall back to their empty values. */
export function sanitizeLayoutBlocks(raw: unknown): ExportedLayoutBlock[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry: unknown, index): ExportedLayoutBlock[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const block = entry as Record<string, unknown>
    const x = finite(block.x)
    const y = finite(block.y)
    const width = finite(block.width)
    const height = finite(block.height)
    if (x == null || y == null || width == null || height == null || width < 0 || height < 0) return []
    const kind = block.kind as ExportedLayoutBlock['kind']
    const shape = block.shape as ExportedLayoutBlock['shape']
    if (!KINDS.has(kind) || !SHAPES.has(shape)) return []
    const color = block.color as string
    if (!isHexColor(color) && !(kind === 'note' && color === NOTE_NO_FILL)) return []
    const mark = kind === 'mark' ? markData(block.markData) : null
    if (kind === 'mark' && !mark) return []
    const fontSize = finite(block.fontSize)
    return [
      {
        label: typeof block.label === 'string' ? block.label : '',
        shape,
        color,
        x,
        y,
        width,
        height,
        rotation: finite(block.rotation) ?? 0,
        zIndex: Number.isInteger(block.zIndex) ? (block.zIndex as number) : index,
        personName: typeof block.personName === 'string' ? block.personName : null,
        labelColor: isHexColor(block.labelColor as string) ? (block.labelColor as string) : null,
        kind,
        fontSize: fontSize != null && fontSize > 0 ? fontSize : null,
        fontBold: block.fontBold === true,
        markData: mark
      }
    ]
  })
}
