import { forwardRef } from 'react'
import { Group, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { RoomLayoutBlockDraft } from '@shared/types/setup'
import {
  hasNoteFill,
  NOTE_DEFAULT_FONT_SIZE,
  NOTE_FONT_FAMILY,
  NOTE_LINE_HEIGHT,
  NOTE_PADDING,
  resolveNoteTextColor
} from '@shared/constants/layoutNotes'
import { clampCenterToRoom, rotatedHalfExtents } from './LayoutBlockIcon'

interface Props {
  block: RoomLayoutBlockDraft
  selected: boolean
  /** True while the in-place editor is open on this note. The editor draws the note itself (a
   *  textarea styled to match), so the canvas copy is hidden rather than painted underneath it. */
  editing: boolean
  imageSize: { width: number; height: number }
  onSelect: (additive: boolean) => void
  onEdit: () => void
  onDragStart: () => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: (x: number, y: number) => void
  onContextMenu: (clientX: number, clientY: number) => void
  /** See LayoutBlockIcon's `snap`. */
  snap?: (center: { x: number; y: number }) => { x: number; y: number }
}

/** A free-typed text note on the floor plan — the counterpart of LayoutBlockIcon for blocks with
 *  kind 'note', taking the same props so LayoutStage can treat the two alike.
 *
 *  Unlike a block label, the text is never shrunk to fit: a note's font size is the user's choice,
 *  and the note's HEIGHT follows the text instead (fitNoteHeight, applied by the layout store on
 *  every change). Only its width is dragged. */
const LayoutNote = forwardRef<Konva.Group, Props>(function LayoutNote(
  { block, selected, editing, imageSize, onSelect, onEdit, onDragStart, onDragMove, onDragEnd, onContextMenu, snap },
  ref
) {
  const filled = hasNoteFill(block.color)
  const textColor = resolveNoteTextColor(block.color, block.labelColor)

  // Same clamp as LayoutBlockIcon's dragBoundFunc — see the comment there for why the position is
  // converted into the Layer's room-pixel space first.
  function dragBoundFunc(this: Konva.Node, pos: { x: number; y: number }): { x: number; y: number } {
    const parent = this.getParent()!
    const local = parent.getAbsoluteTransform().copy().invert().point(pos)
    const { halfWidth, halfHeight } = rotatedHalfExtents(block.width, block.height, block.rotation)
    let center = clampCenterToRoom(local, halfWidth, halfHeight, imageSize)
    if (snap) center = clampCenterToRoom(snap(center), halfWidth, halfHeight, imageSize)
    return parent.getAbsoluteTransform().point(center)
  }

  function handleContextMenu(e: Konva.KonvaEventObject<PointerEvent>): void {
    e.evt.preventDefault()
    e.cancelBubble = true
    if (!selected) onSelect(false)
    onContextMenu(e.evt.clientX, e.evt.clientY)
  }

  return (
    <Group
      ref={ref}
      x={block.x}
      y={block.y}
      offsetX={block.width / 2}
      offsetY={block.height / 2}
      rotation={block.rotation}
      visible={!editing}
      draggable
      dragBoundFunc={dragBoundFunc}
      onClick={(e) => onSelect(e.evt.metaKey || e.evt.ctrlKey)}
      onTap={() => onSelect(false)}
      onDblClick={onEdit}
      onDblTap={onEdit}
      onDragStart={onDragStart}
      onDragMove={(e) => onDragMove(e.target.x(), e.target.y())}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      onContextMenu={handleContextMenu}
    >
      <Rect
        name="note-shape"
        width={block.width}
        height={block.height}
        // 'transparent' is still a fill as far as Konva's hit testing goes, so a plain-text note
        // can be grabbed anywhere in its box, not only on the glyphs.
        fill={block.color}
        cornerRadius={2}
        // Blocks mark selection with the Transformer's blue (see LayoutBlockIcon). A plain-text
        // note has no edge of its own otherwise, so its box is only ever drawn while selected.
        stroke={selected ? '#00a1ff' : undefined}
        strokeWidth={selected ? 2 : 0}
        dash={selected && !filled ? [6, 4] : undefined}
      />
      <Text
        name="note-label"
        text={block.label}
        width={block.width}
        padding={NOTE_PADDING}
        fontFamily={NOTE_FONT_FAMILY}
        fontSize={block.fontSize ?? NOTE_DEFAULT_FONT_SIZE}
        fontStyle={block.fontBold ? 'bold' : 'normal'}
        lineHeight={NOTE_LINE_HEIGHT}
        wrap="word"
        fill={textColor}
        listening={false}
      />
    </Group>
  )
})

export default LayoutNote
