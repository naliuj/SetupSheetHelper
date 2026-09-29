/** Smart-guide snapping for Layout Mode drags: while a block or note is dragged, its left, center
 *  or right edge (and top, middle or bottom) jumps onto the matching line of another block when it
 *  comes within a few pixels, and onto the room's center lines — so things can be lined up by feel
 *  instead of by eye. Pure geometry; LayoutStage does the wiring, drawing and haptics.
 *
 *  Everything is in room pixels, on each block's axis-aligned bounding box (rotation included, via
 *  rotatedHalfExtents) — a rotated block lines up by the box it visibly occupies. */

export interface SnapBox {
  center: { x: number; y: number }
  halfWidth: number
  halfHeight: number
}

/** One line something can snap to: a vertical line at x = pos (axis 'x') or a horizontal one at
 *  y = pos (axis 'y'), with the span it covers along the other axis — used to draw the guide from
 *  the target to the moving block rather than across the whole room. */
interface SnapLine {
  pos: number
  from: number
  to: number
  /** Edges only catch edges and centers only catch centers — the design-tool convention. Letting
   *  any line catch any other tripled the lines a drag passes, and on a busy plan the snaps (and
   *  their taps) came every few pixels. */
  kind: 'edge' | 'center'
}

export interface SnapTargets {
  xs: SnapLine[]
  ys: SnapLine[]
}

/** A guide to draw: a vertical line at x = pos from y = from to y = to (axis 'x'), or the
 *  horizontal equivalent. */
export interface SnapGuide {
  axis: 'x' | 'y'
  pos: number
  from: number
  to: number
}

export interface SnapResult {
  center: { x: number; y: number }
  guides: SnapGuide[]
  /** Where it snapped on each axis, or null. Changes exactly when the snap does — what the caller
   *  keys the haptic tap and the guide redraw off. */
  snappedX: number | null
  snappedY: number | null
}

/** The lines the moving block can snap to: each other box's three vertical and three horizontal
 *  lines, plus the room's own center lines. */
export function buildSnapTargets(boxes: SnapBox[], room: { width: number; height: number }): SnapTargets {
  const xs: SnapLine[] = [{ pos: room.width / 2, from: 0, to: room.height, kind: 'center' }]
  const ys: SnapLine[] = [{ pos: room.height / 2, from: 0, to: room.width, kind: 'center' }]
  for (const b of boxes) {
    const top = b.center.y - b.halfHeight
    const bottom = b.center.y + b.halfHeight
    const left = b.center.x - b.halfWidth
    const right = b.center.x + b.halfWidth
    xs.push({ pos: left, from: top, to: bottom, kind: 'edge' }, { pos: right, from: top, to: bottom, kind: 'edge' })
    xs.push({ pos: b.center.x, from: top, to: bottom, kind: 'center' })
    ys.push({ pos: top, from: left, to: right, kind: 'edge' }, { pos: bottom, from: left, to: right, kind: 'edge' })
    ys.push({ pos: b.center.y, from: left, to: right, kind: 'center' })
  }
  return { xs, ys }
}

/** The closest line within `threshold` to any of the moving box's three lines on one axis — and
 *  how far the box has to move to sit on it. */
function nearest(
  lines: SnapLine[],
  center: number,
  half: number,
  threshold: number
): { shift: number; pos: number } | null {
  let best: { shift: number; pos: number } | null = null
  for (const line of lines) {
    for (const offset of line.kind === 'center' ? [0] : [-half, half]) {
      const shift = line.pos - (center + offset)
      if (Math.abs(shift) <= threshold && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, pos: line.pos }
    }
  }
  return best
}

/** Snaps `moving` onto the nearest target lines within `threshold` on each axis independently, and
 *  returns the guides to draw for whichever axes snapped. */
export function computeSnap(moving: SnapBox, targets: SnapTargets, threshold: number): SnapResult {
  const snapX = nearest(targets.xs, moving.center.x, moving.halfWidth, threshold)
  const snapY = nearest(targets.ys, moving.center.y, moving.halfHeight, threshold)
  const center = { x: moving.center.x + (snapX?.shift ?? 0), y: moving.center.y + (snapY?.shift ?? 0) }

  const top = center.y - moving.halfHeight
  const bottom = center.y + moving.halfHeight
  const left = center.x - moving.halfWidth
  const right = center.x + moving.halfWidth
  // Every target sitting on the snapped line, not just the first found, so a row of three
  // aligned blocks draws one guide through all of them.
  const EPSILON = 0.5
  const guides: SnapGuide[] = []
  if (snapX) {
    const on = targets.xs.filter((l) => Math.abs(l.pos - snapX.pos) < EPSILON)
    guides.push({
      axis: 'x',
      pos: snapX.pos,
      from: Math.min(top, ...on.map((l) => l.from)),
      to: Math.max(bottom, ...on.map((l) => l.to))
    })
  }
  if (snapY) {
    const on = targets.ys.filter((l) => Math.abs(l.pos - snapY.pos) < EPSILON)
    guides.push({
      axis: 'y',
      pos: snapY.pos,
      from: Math.min(left, ...on.map((l) => l.from)),
      to: Math.max(right, ...on.map((l) => l.to))
    })
  }
  return { center, guides, snappedX: snapX?.pos ?? null, snappedY: snapY?.pos ?? null }
}
