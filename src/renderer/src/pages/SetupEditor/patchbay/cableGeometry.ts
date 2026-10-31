import type { PatchPoint } from '@shared/types/patchbay'

export interface Pt {
  x: number
  y: number
}

/** The curve's control point. A hanging cable droops below the line between its plugs; how far is
 *  `sag` (0–1) times a length that grows with the span, so a long run droops more than a short
 *  hop at the same setting, plus a floor so even a cable between neighboring jacks visibly hangs.
 *  A quadratic curve's lowest point sits halfway to its control point, hence the doubling. */
export function cableControlPoint(from: Pt, to: Pt, sag: number): Pt {
  const span = Math.hypot(to.x - from.x, to.y - from.y)
  const droop = sag * (span * 0.45 + 40)
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + droop * 2 }
}

/** A hex color darkened toward black — the outline that keeps a white or yellow cable visible on
 *  white paper. */
export function darken(hex: string, amount = 0.45): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#000000'
  const n = parseInt(m[1], 16)
  const ch = (shift: number): string =>
    Math.round(((n >> shift) & 255) * (1 - amount))
      .toString(16)
      .padStart(2, '0')
  return `#${ch(16)}${ch(8)}${ch(0)}`
}

/** Finds jacks near a point quickly enough to run on every mouse move: points bucketed into a grid
 *  of cells the size of the snap radius. */
export class PointIndex {
  readonly radius: number
  private cells = new Map<string, PatchPoint[]>()

  constructor(readonly points: PatchPoint[]) {
    this.radius = snapRadius(points)
    for (const p of points) {
      const key = this.key(Math.floor(p.x / this.radius), Math.floor(p.y / this.radius))
      const cell = this.cells.get(key)
      if (cell) cell.push(p)
      else this.cells.set(key, [p])
    }
  }

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`
  }

  /** The jack within the snap radius closest to `pos`, if any. */
  nearest(pos: Pt): PatchPoint | null {
    const cx = Math.floor(pos.x / this.radius)
    const cy = Math.floor(pos.y / this.radius)
    let best: PatchPoint | null = null
    let bestDistance = this.radius
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const p of this.cells.get(this.key(cx + dx, cy + dy)) ?? []) {
          const d = Math.hypot(p.x - pos.x, p.y - pos.y)
          if (d <= bestDistance) {
            bestDistance = d
            best = p
          }
        }
      }
    }
    return best
  }

  byId(id: string | null): PatchPoint | null {
    if (!id) return null
    return this.points.find((p) => p.id === id) ?? null
  }
}

/** Half the usual gap between neighboring jacks in a row — close enough to grab a jack without
 *  reaching its neighbor. */
function snapRadius(points: PatchPoint[]): number {
  const rows = new Map<number, number[]>()
  for (const p of points) {
    const key = Math.round(p.y)
    const row = rows.get(key)
    if (row) row.push(p.x)
    else rows.set(key, [p.x])
  }
  const gaps: number[] = []
  for (const xs of rows.values()) {
    xs.sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1])
  }
  if (gaps.length === 0) return 16
  gaps.sort((a, b) => a - b)
  return Math.max(6, Math.min(40, gaps[Math.floor(gaps.length / 2)] / 2))
}

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** How finely a cable's curve is walked when testing it against a selection rectangle. Enough
 *  that the straight pieces between samples hug even a deep droop. */
const CURVE_SAMPLES = 24

/** Whether a cable, drawn as cableControlPoint's curve, passes through `rect` anywhere — a plug
 *  end inside it, or any stretch of the curve crossing it. The curve is walked as short straight
 *  pieces and each piece is clipped against the rectangle, so a thin marquee that slips between
 *  two samples still catches the cable. */
export function cableIntersectsRect(from: Pt, to: Pt, sag: number, rect: Rect): boolean {
  const c = cableControlPoint(from, to, sag)
  let prev = from
  if (pointInRect(prev, rect)) return true
  for (let i = 1; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES
    const u = 1 - t
    const next = {
      x: u * u * from.x + 2 * u * t * c.x + t * t * to.x,
      y: u * u * from.y + 2 * u * t * c.y + t * t * to.y
    }
    if (segmentIntersectsRect(prev, next, rect)) return true
    prev = next
  }
  return false
}

function pointInRect(p: Pt, r: Rect): boolean {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom
}

/** Liang–Barsky clipping: does any part of the segment a→b lie inside the rectangle? */
function segmentIntersectsRect(a: Pt, b: Pt, r: Rect): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  const edges: [number, number][] = [
    [-dx, a.x - r.left],
    [dx, r.right - a.x],
    [-dy, a.y - r.top],
    [dy, r.bottom - a.y]
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false // parallel to this edge and outside it
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
  }
  return t0 <= t1
}
