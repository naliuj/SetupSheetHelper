import Konva from 'konva'
import type { RoomLayoutBlockDraft } from '@shared/types/setup'
import {
  NOTE_DEFAULT_FONT_SIZE,
  NOTE_FONT_FAMILY,
  NOTE_LINE_HEIGHT,
  NOTE_PADDING
} from '@shared/constants/layoutNotes'

// One detached Text node reused for every measurement. It is never added to a layer, so it never
// draws; Konva still lays out its lines, which is the point — the height comes from the same
// wrapping code that renders the note, so the box always fits exactly what LayoutNote draws.
let measureNode: Konva.Text | null = null

/** The height a note needs for its text at its width, padding included, in room pixels. Blank
 *  text still measures one line, so an empty note is as tall as a note with a word in it. */
export function measureNoteHeight(text: string, width: number, fontSize: number, bold: boolean): number {
  if (!measureNode) {
    measureNode = new Konva.Text({ fontFamily: NOTE_FONT_FAMILY, lineHeight: NOTE_LINE_HEIGHT, wrap: 'word' })
  }
  measureNode.setAttrs({
    text: text.length > 0 ? text : ' ',
    width,
    fontSize,
    fontStyle: bold ? 'bold' : 'normal',
    padding: NOTE_PADDING
  })
  return Math.ceil(measureNode.height())
}

/** A note with its height set to fit its text. The top edge stays where it was and the note grows
 *  or shrinks downward, the way text does as you type — x/y is the note's center (as for every
 *  block), so the center moves by half the change, along the note's own rotated vertical axis.
 *  Blocks come back unchanged. */
export function fitNoteHeight<T extends RoomLayoutBlockDraft>(block: T): T {
  if (block.kind !== 'note') return block
  const height = measureNoteHeight(block.label, block.width, block.fontSize ?? NOTE_DEFAULT_FONT_SIZE, block.fontBold)
  if (height === block.height) return block
  const half = (height - block.height) / 2
  const rad = (block.rotation * Math.PI) / 180
  return { ...block, height, x: block.x - half * Math.sin(rad), y: block.y + half * Math.cos(rad) }
}
