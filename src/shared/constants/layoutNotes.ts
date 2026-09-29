import { COLOR_SWATCHES, isHexColor, readableTextColor } from './swatches'

/** Layout Mode text notes: free-typed text placed on the floor plan. A note is a room layout block
 *  with kind 'note' (see RoomLayoutBlock) — these are the numbers and presets that make one. */

/** A note's fill when it has none: plain text straight on the plan. Konva draws 'transparent' as
 *  an invisible fill that still takes clicks, so a plain-text note stays grabbable across its
 *  whole box rather than only on the glyphs. */
export const NOTE_NO_FILL = 'transparent'

/** The sizes A− / A+ step through, in room pixels. */
export const NOTE_FONT_SIZES = [10, 12, 14, 18, 24, 32] as const
export const NOTE_DEFAULT_FONT_SIZE = 14
export const NOTE_DEFAULT_WIDTH = 180
/** Space between the note's edge and its text, in room pixels, on every side. */
export const NOTE_PADDING = 8
export const NOTE_LINE_HEIGHT = 1.25
/** The canvas font. Konva's default, and what block labels use, so notes and labels match — and
 *  what the in-place editor uses too, so text wraps at the same place while typing as after. */
export const NOTE_FONT_FAMILY = 'Arial'

/** Text on a note with no fill sits on the floor plan itself, which is white paper or a light
 *  drawing, so Auto is the app's dark text color. */
const NOTE_TEXT_ON_PLAN = '#1a1d23'

export type NotePreset = 'text' | 'sticky'

/** The two starting points offered in the palette. The fill is only a default; the format bar
 *  changes it either way afterward. */
export const NOTE_PRESETS: Record<NotePreset, { label: string; color: string }> = {
  text: { label: 'Text', color: NOTE_NO_FILL },
  sticky: { label: 'Sticky note', color: COLOR_SWATCHES[3].lightest }
}

export function hasNoteFill(color: string): boolean {
  return color !== NOTE_NO_FILL
}

/** A note's text color: the user's pick when there is a valid one, otherwise black or white for
 *  the fill, or the dark plan color when there is no fill. The note counterpart of
 *  resolveLabelColor. */
export function resolveNoteTextColor(fill: string, labelColor: string | null | undefined): string {
  if (isHexColor(labelColor)) return labelColor
  return isHexColor(fill) ? readableTextColor(fill) : NOTE_TEXT_ON_PLAN
}

/** The color a note's text is actually drawn on, for the contrast warning: its fill, or white
 *  paper when it has none. */
export function noteBackdrop(fill: string): string {
  return isHexColor(fill) ? fill : '#ffffff'
}

/** The next size up (+1) or down (-1) from `current`. A size that isn't on the list — none should
 *  be, but a database can hold anything — steps to the nearest one in that direction. */
export function stepNoteFontSize(current: number, delta: 1 | -1): number {
  if (delta === 1) return NOTE_FONT_SIZES.find((s) => s > current) ?? NOTE_FONT_SIZES[NOTE_FONT_SIZES.length - 1]
  return [...NOTE_FONT_SIZES].reverse().find((s) => s < current) ?? NOTE_FONT_SIZES[0]
}
