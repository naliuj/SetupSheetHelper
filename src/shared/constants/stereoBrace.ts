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
 *  The two are EXACT MIRRORS of each other about the join, and that is worth preserving. An earlier
 *  pair was not: the top ran y=1.5..24 while the bottom ran y=0..22.5, so the top half hugged the
 *  bottom of its row while the bottom half floated a unit and a half above the bottom of its own.
 *  The whole brace sat high in the pair and the lower tip read as if it had been cut off. Each path
 *  now spans the full 0..24, with the spine mirrored (17..5 against 7..19), so the brace is
 *  symmetric about the row boundary and both outer tips sit the same distance from the pair's
 *  edges. If you edit one, mirror the other. */
export const STEREO_BRACE_TOP = 'M 13 0 C 9.5 0, 8.5 1.5, 8.5 5 L 8.5 17 C 8.5 21, 6 22.5, 1.5 24'
export const STEREO_BRACE_BOTTOM = 'M 1.5 0 C 6 1.5, 8.5 3, 8.5 7 L 8.5 19 C 8.5 22.5, 9.5 24, 13 24'

/** The path coordinate box. Width matters to callers: the on-screen lane and the PDF's left margin
 *  both have to reserve at least this much, or the curls have no room and the brace reads as a
 *  vertical squiggle rather than a brace. */
export const STEREO_BRACE_VIEWBOX = { width: 14, height: 24 }

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
