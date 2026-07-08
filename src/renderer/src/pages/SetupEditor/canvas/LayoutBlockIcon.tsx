import { forwardRef } from 'react'
import { Circle, Group, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { RoomLayoutBlockDraft } from '@shared/types/setup'

interface Props {
  block: RoomLayoutBlockDraft
  selected: boolean
  onSelect: () => void
  onDragEnd: (x: number, y: number) => void
  onContextMenu: (clientX: number, clientY: number) => void
}

/** A single Layout Mode block — fully self-contained (label/shape/color/width/height come
 *  straight off the block, no catalog lookup). Sized by width/height directly rather than a
 *  uniform scale multiplier, so independent-axis resize (via the Transformer in
 *  LayoutStage.tsx) works naturally. */
const LayoutBlockIcon = forwardRef<Konva.Group, Props>(function LayoutBlockIcon(
  { block, selected, onSelect, onDragEnd, onContextMenu },
  ref
) {
  const strokeColor = '#ffffff'
  const strokeWidth = selected ? 3 : 0
  // Fit the label inside the shape's bounds — a circle's usable box is its inscribed square,
  // a rect's is itself minus a small margin. Font size scales down for small blocks so short
  // labels ("DI") stay legible without overflowing tiny custom blocks.
  const isCircle = block.shape === 'circle'
  const boxSize = isCircle ? Math.min(block.width, block.height) * 0.7 : undefined
  const textWidth = isCircle ? boxSize! : Math.max(block.width - 8, 4)
  const textHeight = isCircle ? boxSize! : Math.max(block.height - 8, 4)
  const fontSize = Math.max(9, Math.min(36, Math.min(block.width, block.height) / 4))

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>): void {
    onDragEnd(e.target.x(), e.target.y())
  }

  function handleContextMenu(e: Konva.KonvaEventObject<PointerEvent>): void {
    e.evt.preventDefault()
    e.cancelBubble = true
    onSelect()
    onContextMenu(e.evt.clientX, e.evt.clientY)
  }

  return (
    <Group
      ref={ref}
      x={block.x}
      y={block.y}
      rotation={block.rotation}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
    >
      {block.shape === 'circle' ? (
        <Circle
          radius={Math.min(block.width, block.height) / 2}
          fill={block.color}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      ) : (
        <Rect
          x={-block.width / 2}
          y={-block.height / 2}
          width={block.width}
          height={block.height}
          fill={block.color}
          cornerRadius={6}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      )}
      <Text
        text={block.label}
        fontSize={fontSize}
        fontStyle="bold"
        fill="#fff"
        shadowColor="#000"
        shadowBlur={3}
        shadowOpacity={0.9}
        width={textWidth}
        height={textHeight}
        x={-textWidth / 2}
        y={-textHeight / 2}
        align="center"
        verticalAlign="middle"
        wrap="word"
        ellipsis
        listening={false}
      />
    </Group>
  )
})

export default LayoutBlockIcon
