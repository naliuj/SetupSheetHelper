import type { PatchPoint } from '../types/patchbay'

/** A position on a patchbay drawing, in room pixels. */
export interface Pt {
  x: number
  y: number
}

/** Finds jacks near a point quickly enough to run on every mouse move: points bucketed into a grid
 *  of cells the size of the snap radius. Shared, not renderer-only, because the PDF and spreadsheet
 *  exports name a cable's ends in the main process with the same rule the editor snaps by. */
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

  /** The jack a cable end sits on. Position decides, not the stored id: a re-detection can shift
   *  ids, and a replaced drawing can put a different jack under the same id, so the stored id only
   *  wins while its jack is still within reach of the end. Otherwise the nearest jack in reach, and
   *  null for an end that isn't on one. */
  resolveEnd(pos: Pt, storedId: string | null): PatchPoint | null {
    const stored = this.byId(storedId)
    if (stored && Math.hypot(stored.x - pos.x, stored.y - pos.y) <= this.radius) return stored
    return this.nearest(pos)
  }
}

/** Half the usual gap between neighboring jacks in a row — close enough to grab a jack without
 *  reaching its neighbor. */
export function snapRadius(points: PatchPoint[]): number {
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
