import { getStroke } from 'perfect-freehand'
import type { MarkData, MarkTool, RoomLayoutBlockDraft } from '@shared/types/setup'
import { COLOR_SWATCHES } from '@shared/constants/swatches'

/** The geometry of Layout Mode markup: turning pointer samples into stored marks, drawing freehand
 *  ink, and the partial eraser. Pure functions on room-pixel coordinates — LayoutStage does the
 *  pointer handling, LayoutMark the drawing. See MarkData for how a mark is stored. */

export const MARK_COLORS: { hex: string; name: string }[] = [
  { hex: COLOR_SWATCHES[1].base, name: 'Red' },
  { hex: COLOR_SWATCHES[6].dark, name: 'Blue' },
  { hex: COLOR_SWATCHES[4].dark, name: 'Green' },
  { hex: '#1a1d23', name: 'Black' },
  { hex: COLOR_SWATCHES[3].light, name: 'Yellow' }
]

/** Pen and line widths, in room pixels (a Letter-sized plan is 1584 wide). */
export const MARK_SIZES = [2, 4, 8] as const
export const DEFAULT_MARK_SIZE = 4

/** The highlighter is a broad translucent marker whatever the chosen size: a thin highlighter is
 *  just a faint pen. */
export const HIGHLIGHTER_WIDTH_FACTOR = 5
export const HIGHLIGHTER_OPACITY = 0.4

/** Konva's Transformer won't resize below 8 room px, so no mark is ever smaller. */
const MIN_BOX = 8

export interface MarkBox {
  /** Center, like every layout block. */
  x: number
  y: number
  width: number
  height: number
}

export interface NewMark {
  box: MarkBox
  markData: MarkData
  rotation?: number
}

const isInk = (tool: MarkTool): boolean => tool === 'pen' || tool === 'highlighter'

/** The width a mark is drawn at. */
export function strokeWidth(data: Pick<MarkData, 'tool' | 'size'>): number {
  return data.tool === 'highlighter' ? data.size * HIGHLIGHTER_WIDTH_FACTOR : data.size
}

/** How far a mark's drawing reaches past its points — half its width, plus an arrowhead's reach
 *  — so the bounding box contains everything that is painted. */
function padding(data: Pick<MarkData, 'tool' | 'size'>): number {
  const half = strokeWidth(data) / 2 + 1
  return data.tool === 'arrow' ? half + data.size * 4 : half
}

/** A stored mark from absolute room points: the bounding box, and the points moved to be relative
 *  to its top-left corner. `points` is the MarkData layout for the tool (see MarkData) but in room
 *  coordinates; for ellipse and rect it is the two drag corners [x1, y1, x2, y2]. */
export function makeMark(tool: MarkTool, color: string, size: number, points: number[]): NewMark {
  const stride = isInk(tool) ? 3 : 2
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i + 1 < points.length; i += stride) {
    minX = Math.min(minX, points[i])
    maxX = Math.max(maxX, points[i])
    minY = Math.min(minY, points[i + 1])
    maxY = Math.max(maxY, points[i + 1])
  }
  // A box is the drag rectangle itself — its outline is drawn on it, not padded out from it.
  const pad = tool === 'ellipse' || tool === 'rect' ? 0 : padding({ tool, size })
  let left = minX - pad
  let top = minY - pad
  let width = maxX - minX + pad * 2
  let height = maxY - minY + pad * 2
  if (width < MIN_BOX) {
    left -= (MIN_BOX - width) / 2
    width = MIN_BOX
  }
  if (height < MIN_BOX) {
    top -= (MIN_BOX - height) / 2
    height = MIN_BOX
  }
  const relative =
    tool === 'ellipse' || tool === 'rect'
      ? []
      : points.map((v, i) => (i % stride === 0 ? v - left : i % stride === 1 ? v - top : v))
  return {
    box: { x: left + width / 2, y: top + height / 2, width, height },
    markData: { tool, color, size, points: relative }
  }
}

/** A mouse gives no pressure (Chromium reports 0.5 while a button is down), so its ink is shaped
 *  by speed instead — perfect-freehand's simulated pressure — rather than drawn as a flat tube. */
function hasRealPressure(points: number[]): boolean {
  for (let i = 2; i < points.length; i += 3) if (points[i] !== 0.5) return true
  return false
}

/** The filled outline of a pen or highlighter stroke, as a polygon of [x, y] points. The pen
 *  thins with lighter pressure; the highlighter is a flat, even marker. */
export function inkOutline(data: MarkData): number[][] {
  const input: number[][] = []
  for (let i = 0; i + 2 < data.points.length; i += 3) input.push([data.points[i], data.points[i + 1], data.points[i + 2]])
  const highlighter = data.tool === 'highlighter'
  return getStroke(input, {
    size: strokeWidth(data),
    thinning: highlighter ? 0 : 0.6,
    smoothing: 0.5,
    streamline: 0.45,
    simulatePressure: !highlighter && !hasRealPressure(data.points),
    last: true,
    start: { cap: !highlighter },
    end: { cap: !highlighter }
  })
}

/** Traces an outline on a canvas as a smooth closed path (quadratic curves through the midpoints
 *  of its vertices — the standard way to draw perfect-freehand output). */
export function traceOutline(ctx: { moveTo(x: number, y: number): void; quadraticCurveTo(cx: number, cy: number, x: number, y: number): void; closePath(): void }, outline: number[][]): void {
  if (outline.length < 2) return
  const [first, ...rest] = outline
  ctx.moveTo(first[0], first[1])
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    const b = rest[(i + 1) % rest.length]
    ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
  }
  ctx.closePath()
}

/** A room point in a mark's own frame: relative to its top-left, with its rotation undone. */
export function roomToLocal(block: Pick<RoomLayoutBlockDraft, 'x' | 'y' | 'width' | 'height' | 'rotation'>, x: number, y: number): [number, number] {
  const rad = (-block.rotation * Math.PI) / 180
  const dx = x - block.x
  const dy = y - block.y
  return [dx * Math.cos(rad) - dy * Math.sin(rad) + block.width / 2, dx * Math.sin(rad) + dy * Math.cos(rad) + block.height / 2]
}

/** The reverse of roomToLocal. */
export function localToRoom(block: Pick<RoomLayoutBlockDraft, 'x' | 'y' | 'width' | 'height' | 'rotation'>, x: number, y: number): [number, number] {
  const rad = (block.rotation * Math.PI) / 180
  const dx = x - block.width / 2
  const dy = y - block.height / 2
  return [block.x + dx * Math.cos(rad) - dy * Math.sin(rad), block.y + dx * Math.sin(rad) + dy * Math.cos(rad)]
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/** Whether an eraser circle (local coordinates) touches a line, arrow, ellipse or box — shapes are
 *  erased whole. */
function touchesShape(data: MarkData, width: number, height: number, ex: number, ey: number, radius: number): boolean {
  const reach = radius + strokeWidth(data) / 2
  if (data.tool === 'line' || data.tool === 'arrow') {
    const [x1, y1, x2, y2] = data.points
    return distanceToSegment(ex, ey, x1, y1, x2, y2) <= reach
  }
  if (data.tool === 'rect') {
    const edges: [number, number, number, number][] = [
      [0, 0, width, 0],
      [width, 0, width, height],
      [width, height, 0, height],
      [0, height, 0, 0]
    ]
    return edges.some(([x1, y1, x2, y2]) => distanceToSegment(ex, ey, x1, y1, x2, y2) <= reach)
  }
  // Ellipse: how far the point is from the outline, measured along its own radius — exact for a
  // circle and close enough for any ellipse at eraser scale.
  const rx = width / 2
  const ry = height / 2
  const nx = (ex - rx) / rx
  const ny = (ey - ry) / ry
  return Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry) <= reach
}

/** Fills in a stroke so no two neighboring points are further apart than `step` — a fast stroke
 *  samples sparsely, and an eraser passing between two far-apart points would miss the ink
 *  drawn between them. */
function densify(points: number[], step: number): number[] {
  const out: number[] = []
  for (let i = 0; i + 2 < points.length; i += 3) {
    if (i > 0) {
      const [x0, y0, p0] = [points[i - 3], points[i - 2], points[i - 1]]
      const [x1, y1, p1] = [points[i], points[i + 1], points[i + 2]]
      const n = Math.floor(Math.hypot(x1 - x0, y1 - y0) / step)
      for (let k = 1; k < n; k++) {
        const t = k / n
        out.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, p0 + (p1 - p0) * t)
      }
    }
    out.push(points[i], points[i + 1], points[i + 2])
  }
  return out
}

export type EraseResult =
  | { kind: 'untouched' }
  | { kind: 'removed' }
  /** Ink split into what's left; each run in the mark's local frame, [x, y, p, …]. */
  | { kind: 'split'; runs: number[][] }

/** What an eraser pass does to one mark. `eraser` is the pass's samples in room pixels; `radius`
 *  its size in room pixels. Ink loses just the part the eraser covered, and whatever remains
 *  becomes separate runs; a line, arrow or shape the eraser touches goes entirely. */
export function eraseMark(block: RoomLayoutBlockDraft, eraser: number[], radius: number): EraseResult {
  const data = block.markData
  if (!data) return { kind: 'untouched' }
  const local: [number, number][] = []
  for (let i = 0; i + 1 < eraser.length; i += 2) local.push(roomToLocal(block, eraser[i], eraser[i + 1]))

  if (!isInk(data.tool)) {
    return local.some(([ex, ey]) => touchesShape(data, block.width, block.height, ex, ey, radius))
      ? { kind: 'removed' }
      : { kind: 'untouched' }
  }

  const reach = radius + strokeWidth(data) / 2
  const points = densify(data.points, Math.max(1, radius / 2))
  const runs: number[][] = []
  let run: number[] = []
  let erasedAny = false
  for (let i = 0; i + 2 < points.length; i += 3) {
    const [x, y] = [points[i], points[i + 1]]
    if (local.some(([ex, ey]) => Math.hypot(x - ex, y - ey) <= reach)) {
      erasedAny = true
      if (run.length >= 6) runs.push(run)
      run = []
    } else {
      run.push(x, y, points[i + 2])
    }
  }
  if (run.length >= 6) runs.push(run)
  if (!erasedAny) return { kind: 'untouched' }
  return runs.length === 0 ? { kind: 'removed' } : { kind: 'split', runs }
}

/** A piece left by the eraser, as a new mark keeping the original's rotation: the run's box is
 *  worked out in the original's frame, then its center carried back into the room. */
export function markFromRun(block: RoomLayoutBlockDraft, run: number[]): NewMark {
  const data = block.markData as MarkData
  const inFrame = makeMark(data.tool, data.color, data.size, run)
  // makeMark's box center is in the original's local (top-left, unrotated) frame.
  const [cx, cy] = localToRoom(block, inFrame.box.x, inFrame.box.y)
  return { box: { ...inFrame.box, x: cx, y: cy }, markData: inFrame.markData, rotation: block.rotation }
}

/** A mark scaled by a resize — points stretched with the box, so the Transformer's scale can be
 *  folded away like a block's. Pen size is left alone: a bigger drawing, not a fatter pen. */
export function scaleMarkData(data: MarkData, sx: number, sy: number): MarkData {
  if (data.tool === 'ellipse' || data.tool === 'rect') return data
  const stride = isInk(data.tool) ? 3 : 2
  return {
    ...data,
    points: data.points.map((v, i) => (i % stride === 0 ? v * sx : i % stride === 1 ? v * sy : v))
  }
}
