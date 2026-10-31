import type { PatchbayCable, PatchPoint } from '../types/patchbay'
import { cableColorName } from '../constants/patchCables'
import { PointIndex } from './patchPoints'

/** What an end that isn't on any jack is called, in the cable list and the editor's tooltip. */
export const UNLABELED_POINT = 'Unlabeled point'

/** Heading for cables with no section of their own, once other cables in the list do have one —
 *  without it they would read as part of whichever section happened to be printed above them. */
const OTHER_SECTION = 'Other'

type CableEnds = Pick<PatchbayCable, 'fromX' | 'fromY' | 'toX' | 'toY' | 'fromPoint' | 'toPoint'>

/** A cable's two ends named for people: the jack each one sits on (see PointIndex.resolveEnd) and
 *  the text shown for it. The far end carries its strip heading when it differs from the near
 *  end's, so a run from one strip to another ("3" to "3 (CONSOLE IN)") doesn't read as a loop.
 *  The editor's hover tooltip and the exported cable list both use this, so they always agree. */
export function describeCable(
  cable: CableEnds,
  index: PointIndex
): { fromJack: PatchPoint | null; toJack: PatchPoint | null; from: string; to: string } {
  const fromJack = index.resolveEnd({ x: cable.fromX, y: cable.fromY }, cable.fromPoint)
  const toJack = index.resolveEnd({ x: cable.toX, y: cable.toY }, cable.toPoint)
  const from = fromJack?.label ?? UNLABELED_POINT
  let to = toJack?.label ?? UNLABELED_POINT
  if (toJack?.section && toJack.section !== fromJack?.section) to += ` (${toJack.section})`
  return { fromJack, toJack, from, to }
}

/** One line of the exported cable list. */
export interface PatchCableRow {
  /** The heading this row is grouped under: the near end's strip heading, OTHER_SECTION for a row
   *  without one, or null throughout when nothing on the drawing had a heading to read. Rows come
   *  grouped, so a renderer starts a new heading whenever this changes. */
  section: string | null
  from: string
  to: string
  colorName: string
  colorHex: string
}

/** The cable list as the PDF and spreadsheet print it, read the way the drawing is: by where each
 *  cable starts, top row first and left to right along it, then grouped under their strip
 *  headings in the order those first appear. Cables that start off any jack go last. `cables` is
 *  expected in drawing order (z_index, then id), which breaks ties between cables sharing a jack. */
export function buildPatchCableRows(
  cables: (CableEnds & Pick<PatchbayCable, 'color'>)[],
  points: PatchPoint[]
): PatchCableRow[] {
  const index = new PointIndex(points)
  const described = cables.map((cable) => ({ cable, ...describeCable(cable, index) }))

  // Rows are bucketed the same way snapRadius finds them: jacks in one strip share a y, give or
  // take rounding. A stable sort keeps drawing order for cables starting at the same jack.
  const onJack = described
    .filter((d) => d.fromJack)
    .sort((a, b) => Math.round(a.fromJack!.y) - Math.round(b.fromJack!.y) || a.fromJack!.x - b.fromJack!.x)
  const free = described.filter((d) => !d.fromJack)

  const groups = new Map<string | null, typeof described>()
  for (const d of onJack) {
    const key = d.fromJack!.section ?? null
    const group = groups.get(key)
    if (group) group.push(d)
    else groups.set(key, [d])
  }
  // The headingless group goes after every headed one, with the free ends at its end.
  const headingless = [...(groups.get(null) ?? []), ...free]
  groups.delete(null)
  const anyHeading = groups.size > 0

  const ordered = [
    ...[...groups.entries()].flatMap(([section, group]) => group.map((d) => ({ d, section }))),
    ...headingless.map((d) => ({ d, section: anyHeading ? OTHER_SECTION : null }))
  ]
  return ordered.map(({ d, section }) => ({
    section,
    from: d.from,
    to: d.to,
    colorName: cableColorName(d.cable.color),
    colorHex: d.cable.color
  }))
}
