import type { Pt } from '@shared/utils/patchPoints'

// The jack index lives in shared code so the exports can name cable ends in the main process by
// the same rule; re-exported here so the editor keeps one place to import cable geometry from.
export { PointIndex, snapRadius, type Pt } from '@shared/utils/patchPoints'

/** The curve's control point. A hanging cable droops below the line between its plugs; how far is
 *  `sag` (0–1) times a length that grows with the span, so a long run droops more than a short
 *  hop at the same setting, plus a floor so even a cable between neighboring jacks visibly hangs.
 *  A quadratic curve's lowest point sits halfway to its control point, hence the doubling. */
export function cableControlPoint(from: Pt, to: Pt, sag: number): Pt {
  const span = Math.hypot(to.x - from.x, to.y - from.y)
  const droop = sag * (span * 0.45 + 40)
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + droop * 2 }
}

/** Plug size and cable weight scale with the drawing's jack spacing (the snap radius), so cables
 *  look right on a dense bay and a roomy one alike. */
export function cableWeight(radius: number): number {
  return Math.max(2.5, Math.min(7, radius * 0.35))
}

/** How plugs are drawn, an app-wide choice (Patchbay Mode's toolbar): a ring around the jack's
 *  label, so connected jacks stay readable, or the original solid plug on top of it. */
export type PlugStyle = 'ring' | 'solid'

/** The radius of a plug. A ring circles the label rather than covering it: most of the way to the
 *  neighboring jack (the snap radius is half the spacing), never thinner than the cable itself. A
 *  solid plug is a small disc over the jack. */
export function plugRadius(radius: number, style: PlugStyle): number {
  const weight = cableWeight(radius)
  return style === 'ring' ? Math.max(weight * 1.5, radius * 0.85) : weight * 1.4
}

/** Where the curve meets each plug. A ring's bottom, so the cable never runs across the label
 *  inside it (cables droop, so leaving downward is also how one hangs); a solid plug's center. */
export function cableEnds(from: Pt, to: Pt, plug: number, style: PlugStyle): { from: Pt; to: Pt } {
  const drop = style === 'ring' ? plug : 0
  return { from: { x: from.x, y: from.y + drop }, to: { x: to.x, y: to.y + drop } }
}

/** The box a cable's curve covers, plugs and stroke not included (pad by the weight for those).
 *  A quadratic curve's extremes are its ends plus, on each axis, the one turning point where the
 *  derivative is zero, when that falls between the ends. The droop runs downward, so a cable near
 *  the bottom of a drawing hangs past it; the export sizes its page from this so it isn't cut off. */
export function cableBounds(from: Pt, to: Pt, sag: number): Rect {
  const c = cableControlPoint(from, to, sag)
  const extremes = (a: number, ctrl: number, b: number): number[] => {
    const denom = a - 2 * ctrl + b
    if (denom === 0) return [a, b]
    const t = (a - ctrl) / denom
    if (t <= 0 || t >= 1) return [a, b]
    const u = 1 - t
    return [a, b, u * u * a + 2 * u * t * ctrl + t * t * b]
  }
  const xs = extremes(from.x, c.x, to.x)
  const ys = extremes(from.y, c.y, to.y)
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
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
