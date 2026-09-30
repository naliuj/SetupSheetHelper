import { forwardRef, useMemo } from 'react'
import { Arrow, Ellipse, Group, Line, Rect, Shape } from 'react-konva'
import type Konva from 'konva'
import type { RoomLayoutBlockDraft } from '@shared/types/setup'
import { clampCenterToRoom, rotatedHalfExtents } from './LayoutBlockIcon'
import { HIGHLIGHTER_OPACITY, inkOutline, strokeWidth, traceOutline } from './markGeometry'

interface Props {
  block: RoomLayoutBlockDraft
  selected: boolean
  imageSize: { width: number; height: number }
  /** False while a drawing tool is active: a stroke must never grab the mark it starts on. */
  interactive: boolean
  onSelect: (additive: boolean) => void
  onDragStart: () => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: (x: number, y: number) => void
  onContextMenu: (clientX: number, clientY: number) => void
  snap?: (center: { x: number; y: number }) => { x: number; y: number }
}

/** Grabbing a hairline with a mouse is hopeless, so every mark takes clicks this far either side
 *  of what it draws (room pixels). */
const HIT_WIDTH = 12

/** One piece of Layout Mode markup — a pen or highlighter stroke, a line, an arrow, an ellipse or a
 *  box — the counterpart of LayoutBlockIcon and LayoutNote for blocks with kind 'mark'. Its drawing
 *  is in `block.markData`, relative to the block's top-left; the block itself is the bounding box,
 *  which is what selection, dragging and the Transformer work on. Every drawn node is named
 *  `mark-shape` so the black-and-white export can find it. */
const LayoutMark = forwardRef<Konva.Group, Props>(function LayoutMark(
  { block, selected, imageSize, interactive, onSelect, onDragStart, onDragMove, onDragEnd, onContextMenu, snap },
  ref
) {
  const data = block.markData
  const outline = useMemo(
    () => (data && (data.tool === 'pen' || data.tool === 'highlighter') ? inkOutline(data) : null),
    [data]
  )
  if (!data) return null
  const width = strokeWidth(data)

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
      listening={interactive}
      draggable={interactive}
      dragBoundFunc={dragBoundFunc}
      onClick={(e) => onSelect(e.evt.metaKey || e.evt.ctrlKey)}
      onTap={() => onSelect(false)}
      onDragStart={onDragStart}
      onDragMove={(e) => onDragMove(e.target.x(), e.target.y())}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      onContextMenu={handleContextMenu}
    >
      {/* The selected mark's box, since a thin stroke gives no edge of its own to show selection. */}
      {selected && (
        <Rect width={block.width} height={block.height} stroke="#00a1ff" strokeWidth={1.5} dash={[6, 4]} listening={false} />
      )}
      {outline && (
        <Shape
          name="mark-shape"
          fill={data.color}
          opacity={data.tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1}
          sceneFunc={(ctx, shape) => {
            ctx.beginPath()
            traceOutline(ctx, outline)
            ctx.fillShape(shape)
          }}
          hitFunc={(ctx, shape) => {
            // The centerline, drawn wide, so a click near thin ink still lands.
            ctx.beginPath()
            const p = data.points
            if (p.length >= 3) ctx.moveTo(p[0], p[1])
            for (let i = 3; i + 1 < p.length; i += 3) ctx.lineTo(p[i], p[i + 1])
            ctx.lineWidth = Math.max(HIT_WIDTH, width)
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.strokeShape(shape)
          }}
        />
      )}
      {data.tool === 'line' && (
        <Line name="mark-shape" points={data.points} stroke={data.color} strokeWidth={width} lineCap="round" hitStrokeWidth={HIT_WIDTH} />
      )}
      {data.tool === 'arrow' && (
        <Arrow
          name="mark-shape"
          points={data.points}
          stroke={data.color}
          fill={data.color}
          strokeWidth={width}
          pointerLength={width * 4}
          pointerWidth={width * 4}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={HIT_WIDTH}
        />
      )}
      {data.tool === 'rect' && (
        <Rect
          name="mark-shape"
          width={block.width}
          height={block.height}
          stroke={data.color}
          strokeWidth={width}
          lineJoin="round"
          hitStrokeWidth={HIT_WIDTH}
          fillEnabled={false}
        />
      )}
      {data.tool === 'ellipse' && (
        <Ellipse
          name="mark-shape"
          x={block.width / 2}
          y={block.height / 2}
          radiusX={block.width / 2}
          radiusY={block.height / 2}
          stroke={data.color}
          strokeWidth={width}
          hitStrokeWidth={HIT_WIDTH}
          fillEnabled={false}
        />
      )}
    </Group>
  )
})

export default LayoutMark
