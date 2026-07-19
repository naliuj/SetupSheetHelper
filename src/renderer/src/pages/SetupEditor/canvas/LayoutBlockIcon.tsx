import { forwardRef } from 'react'
import { Circle, Group, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { RoomLayoutBlockDraft } from '@shared/types/setup'
import { readableTextColor } from '@shared/constants/swatches'

interface Props {
  block: RoomLayoutBlockDraft
  selected: boolean
  imageSize: { width: number; height: number }
  onSelect: (additive: boolean) => void
  /** Fired on every drag tick (not just at the end) so a multi-selection can be mirrored live —
   *  see LayoutStage.tsx's handleBlockDragMove. */
  onDragMove: (x: number, y: number) => void
  onDragEnd: (x: number, y: number) => void
  onContextMenu: (clientX: number, clientY: number) => void
}

/** Clamp a shape's center so its un-rotated bounding box stays within the room image — a
 *  close-enough approximation without full rotated-bbox math (a rotated block may visually poke
 *  out slightly at extreme angles). Shared by drag (below), the Transformer resize clamp, and
 *  arrow-key nudge (all in LayoutStage.tsx) so the three interactions agree on one boundary rule. */
export function clampCenterToRoom(
  center: { x: number; y: number },
  halfWidth: number,
  halfHeight: number,
  imageSize: { width: number; height: number }
): { x: number; y: number } {
  return {
    x: Math.max(halfWidth, Math.min(center.x, imageSize.width - halfWidth)),
    y: Math.max(halfHeight, Math.min(center.y, imageSize.height - halfHeight))
  }
}

/** A single Layout Mode block — fully self-contained (label/shape/color/width/height come
 *  straight off the block, no catalog lookup). Sized by width/height directly rather than a
 *  uniform scale multiplier, so independent-axis resize (via the Transformer in
 *  LayoutStage.tsx) works naturally. */
const LayoutBlockIcon = forwardRef<Konva.Group, Props>(function LayoutBlockIcon(
  { block, selected, imageSize, onSelect, onDragMove, onDragEnd, onContextMenu },
  ref
) {
  const strokeColor = '#ffffff'
  const strokeWidth = selected ? 3 : 0
  const labelColor = readableTextColor(block.color)
  const labelShadow = labelColor === '#ffffff' ? '#000000' : '#ffffff'
  // Fit the label inside the shape's bounds — a circle's usable box is its inscribed square,
  // a rect's is itself minus a small margin. Font size scales down for small blocks so short
  // labels ("DI") stay legible without overflowing tiny custom blocks.
  const isCircle = block.shape === 'circle'
  const boxSize = isCircle ? Math.min(block.width, block.height) * 0.7 : undefined
  const textWidth = isCircle ? boxSize! : Math.max(block.width - 8, 4)
  const textHeight = isCircle ? boxSize! : Math.max(block.height - 8, 4)
  const fontSize = Math.max(9, Math.min(36, Math.min(block.width, block.height) / 4))

  function handleDragMove(e: Konva.KonvaEventObject<DragEvent>): void {
    onDragMove(e.target.x(), e.target.y())
  }

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>): void {
    onDragEnd(e.target.x(), e.target.y())
  }

  // block.x/y is the shape's CENTER (children are drawn offset by -width/2/-height/2, or a
  // circle radius, from the Group's origin) — clamp the center so the un-rotated bounding box
  // stays within the room image, a close-enough approximation without needing full rotated-bbox
  // math for this UX (a rotated block may visually poke out slightly at extreme angles).
  //
  // Konva calls dragBoundFunc with `pos` in ABSOLUTE (stage-pixel) coordinates, not the node's
  // local/parent space — but the Stage here is scaled by finalScale (fitScale * zoomScale, see
  // LayoutStage.tsx), while imageSize is the room image's raw, unscaled pixel size. Comparing
  // pos directly against imageSize only happened to work at finalScale === 1; at any other zoom
  // it silently over/under-clamps. Convert pos into the parent Layer's local (image-pixel) space
  // via its absolute transform, clamp there against imageSize, then convert back — the standard
  // Konva pattern for dragBoundFunc under a scaled ancestor.
  function dragBoundFunc(this: Konva.Node, pos: { x: number; y: number }): { x: number; y: number } {
    const parent = this.getParent()!
    const toLocal = parent.getAbsoluteTransform().copy().invert()
    const local = toLocal.point(pos)
    const clampedLocal = clampCenterToRoom(local, block.width / 2, block.height / 2, imageSize)
    return parent.getAbsoluteTransform().point(clampedLocal)
  }

  // Cmd/Ctrl+click toggles this block in/out of a multi-selection instead of replacing it.
  function handleClick(e: Konva.KonvaEventObject<MouseEvent>): void {
    onSelect(e.evt.metaKey || e.evt.ctrlKey)
  }

  function handleContextMenu(e: Konva.KonvaEventObject<PointerEvent>): void {
    e.evt.preventDefault()
    e.cancelBubble = true
    // Right-clicking a block that's already part of the current selection leaves the
    // selection intact; right-clicking an unselected block replaces the selection with it.
    if (!selected) onSelect(false)
    onContextMenu(e.evt.clientX, e.evt.clientY)
  }

  return (
    <Group
      ref={ref}
      x={block.x}
      y={block.y}
      rotation={block.rotation}
      draggable
      dragBoundFunc={dragBoundFunc}
      onClick={handleClick}
      onTap={() => onSelect(false)}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
    >
      {block.shape === 'circle' ? (
        <Circle
          name="block-shape"
          radius={Math.min(block.width, block.height) / 2}
          fill={block.color}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      ) : (
        <Rect
          name="block-shape"
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
      {block.personName ? (
        <>
          <Text
            name="block-label"
            text={block.label}
            fontSize={fontSize}
            fontStyle="bold"
            fill={labelColor}
            shadowColor={labelShadow}
            shadowBlur={3}
            shadowOpacity={0.9}
            width={textWidth}
            height={textHeight * 0.6}
            x={-textWidth / 2}
            y={-textHeight / 2}
            align="center"
            verticalAlign="bottom"
            wrap="word"
            ellipsis
            listening={false}
          />
          <Text
            name="block-label"
            text={block.personName}
            fontSize={Math.max(8, fontSize * 0.6)}
            fill={labelColor}
            shadowColor={labelShadow}
            shadowBlur={2}
            shadowOpacity={0.9}
            width={textWidth}
            height={textHeight * 0.4}
            x={-textWidth / 2}
            y={-textHeight / 2 + textHeight * 0.6}
            align="center"
            verticalAlign="top"
            wrap="word"
            ellipsis
            listening={false}
          />
        </>
      ) : (
        <Text
          name="block-label"
          text={block.label}
          fontSize={fontSize}
          fontStyle="bold"
          fill={labelColor}
          shadowColor={labelShadow}
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
      )}
    </Group>
  )
})

export default LayoutBlockIcon
