/** The curly brace marking a linked stereo pair.
 *
 *  One definition, two renderers. The table draws these as SVG paths; the PDF export feeds the
 *  same strings to pdf-lib's drawSvgPath. The bracket they replace could not be shared — it was
 *  CSS borders on screen and two separate drawLine calls in the PDF, which is how the two drifted
 *  apart in the first place.
 *
 *  Split into halves because each row draws its own: a row with a wrapped Notes cell is taller
 *  than its partner, and independent halves still meet exactly on the boundary between them.
 *  Drawn in a 14x24 box, top tip and bottom tip pointing right toward the content, middle spike
 *  pointing left.
 *
 *  The spike arrives HORIZONTALLY: the control point next to each spike endpoint shares its y
 *  (5,24 beside 1.5,24 on the top half; 5,0 beside 1.5,0 on the bottom). That is what makes the
 *  middle point aim straight left instead of sloping into the seam. It also matters that both
 *  halves do it, because they are tangent to one another there — the two spikes lie along the same
 *  line and read as one point rather than a wedge. Give either control point a different y and the
 *  point tilts again.
 *
 *  The two are EXACT MIRRORS of each other about the join, and that is worth preserving. An earlier
 *  pair was not: the top ran y=1.5..24 while the bottom ran y=0..22.5, so the top half hugged the
 *  bottom of its row while the bottom half floated a unit and a half above the bottom of its own.
 *  The whole brace sat high in the pair and the lower tip read as if it had been cut off. Each path
 *  now spans the full 0..24, with the spine mirrored (17..5 against 7..19), so the brace is
 *  symmetric about the row boundary and both outer tips sit the same distance from the pair's
 *  edges. If you edit one, mirror the other. */
export const STEREO_BRACE_TOP = 'M 13 0 C 9.5 0, 8.5 1.5, 8.5 5 L 8.5 17 C 8.5 21, 5 24, 1.5 24'
export const STEREO_BRACE_BOTTOM = 'M 1.5 0 C 5 0, 8.5 3, 8.5 7 L 8.5 19 C 8.5 22.5, 9.5 24, 13 24'

/** The path coordinate box. Width matters to callers: the on-screen lane and the PDF's left margin
 *  both have to reserve at least this much, or the curls have no room and the brace reads as a
 *  vertical squiggle rather than a brace. */
export const STEREO_BRACE_VIEWBOX = { width: 14, height: 24 }

/** Left inset of the path box inside the on-screen lane, in CSS px. The box then spans lane 5..19
 *  of 26, leaving room to its right for the seam link button.
 *
 *  Do not slide the brace right to sit under that button. The two cannot share an axis: the brace's
 *  leftward POINT exists only at the seam, which is exactly where the button is, so a button on the
 *  brace's spine covers the point and the brace collapses to a spine with two small hooks — no
 *  longer a curly brace at all. The button belongs beside the point, not on it. */
export const STEREO_BRACE_LANE_INSET = 5

/** Rendered width of the path box on screen, in CSS px — deliberately NOT the viewBox width, which
 *  is only a coordinate space. preserveAspectRatio="none" stretches one onto the other. */
export const STEREO_BRACE_SCREEN_WIDTH = 15

/** How much of its own row each half spans, as a percentage, measured from the seam outwards.
 *
 *  Two things are set by this one number, and the same value serves both.
 *
 *  CURVATURE. The path is stretched to whatever box it is given, so the box's aspect ratio IS the
 *  brace's shape. At the full row the box was 14 x 31 (1:2.21) while the PDF draws the identical
 *  path at 11pt over a 17pt row (1:1.55) — which is the whole reason print looked curly and the
 *  table looked flat. 15 x (72% of 29 + 2 bleed) = 15 x 22.9 is 1:1.53, so the two now agree.
 *
 *  BADGE CLEARANCE. The brace's outer tips sit at the pair's top and bottom edges, which is exactly
 *  where the NEIGHBOURING seams' link buttons are centred, and those buttons carry an opaque disc
 *  that paints over the tips (the row above owns its own seam button and sits higher in the stacking
 *  order). A tip needs roughly 7px of clearance from the row edge to escape that disc; 72% of a 29px
 *  row leaves 8px. Raising this number back toward 100 buries the fold again. */
export const STEREO_BRACE_SPAN_PERCENT = 72

/** Stroke weight, in CSS px on screen and points in the PDF. Below ~1.4 the brace disappears
 *  against a row; above ~2.5 it starts competing with the source name beside it. */
export const STEREO_BRACE_STROKE = 1.8

/** Width of the on-screen stereo-link column, in CSS px.
 *
 *  Wider than the 20px the old square bracket used, and that is the whole reason the brace is
 *  viable now: below about 26px the curls have no horizontal room and the shape reads as a
 *  vertical squiggle. The column keeps the PAGE background rather than the row tint, so the brace
 *  is the accent on the same ground on every row. */
export const STEREO_LANE_WIDTH = 26

/** The brace path rescaled from its 14x24 box to `width` x `height`.
 *
 *  Only the PDF needs this. On screen an <svg> with preserveAspectRatio="none" stretches the box
 *  for free, but pdf-lib's drawSvgPath offers a UNIFORM `scale` and nothing else, and a brace
 *  scaled uniformly to a 17pt-tall row would be 10pt wide instead of 11 and would not reach the
 *  row's edges.
 *
 *  Safe because these two paths are ours and fixed: every command in them (M, L, C) takes
 *  absolute x,y pairs, so scaling alternate numbers is the whole transform. It is NOT a general
 *  SVG path transformer — arcs, relative commands and H/V would all need handling. */
export function scaleBracePath(d: string, width: number, height: number): string {
  const sx = width / STEREO_BRACE_VIEWBOX.width
  const sy = height / STEREO_BRACE_VIEWBOX.height
  let isX = true
  return d.replace(/-?\d+(?:\.\d+)?/g, (n) => {
    const scaled = Number(n) * (isX ? sx : sy)
    isX = !isX
    return String(Number(scaled.toFixed(4)))
  })
}
