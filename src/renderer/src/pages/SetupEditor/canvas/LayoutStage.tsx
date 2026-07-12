import { useCallback, useEffect, useRef, useState } from 'react'
import { Stage, Layer, Rect, Transformer } from 'react-konva'
import type Konva from 'konva'
import { useLayoutStore, MIN_ZOOM, MAX_ZOOM } from '@renderer/state/layoutStore'
import LayoutBackground from './LayoutBackground'
import LayoutBlockIcon, { clampCenterToRoom } from './LayoutBlockIcon'
import ContextMenu from './ContextMenu'
import RenameBlockModal from './RenameBlockModal'
import ChangeColorPopover from './ChangeColorPopover'
import CustomBlockModal from '../palette/CustomBlockModal'
import Icon from '@renderer/components/Icon'

interface Props {
  studioId: number
  stageRef: React.RefObject<Konva.Stage | null>
  /** Whether Layout Mode is the currently-visible mode. The stage stays mounted (hidden) in
   *  Table Mode too (see SetupEditor.tsx), so the arrow-key nudge below is gated on this — a
   *  layout block left selected from a prior visit shouldn't silently move while the user is
   *  looking at the table. (Delete/Backspace here is intentionally NOT gated the same way —
   *  pre-existing behavior, unrelated to this change.) */
  active: boolean
}

interface PaletteDragPayload {
  label: string
  shape: 'rect' | 'circle'
  color: string
}

const ZOOM_STEP = 1.05
const MARQUEE_THRESHOLD = 5

export default function LayoutStage({ studioId, stageRef, active }: Props): JSX.Element {
  const blocks = useLayoutStore((s) => s.blocks)
  const addBlock = useLayoutStore((s) => s.addBlock)
  const updateBlockTransform = useLayoutStore((s) => s.updateBlockTransform)
  const renameBlock = useLayoutStore((s) => s.renameBlock)
  const updateBlockColor = useLayoutStore((s) => s.updateBlockColor)
  const removeBlocks = useLayoutStore((s) => s.removeBlocks)
  const moveBlocksBy = useLayoutStore((s) => s.moveBlocksBy)
  const selectBlock = useLayoutStore((s) => s.selectBlock)
  const toggleBlock = useLayoutStore((s) => s.toggleBlock)
  const selectBlocksInRect = useLayoutStore((s) => s.selectBlocksInRect)
  const selectedBlockIds = useLayoutStore((s) => s.selectedBlockIds)
  const zoomScale = useLayoutStore((s) => s.zoomScale)
  const panX = useLayoutStore((s) => s.panX)
  const panY = useLayoutStore((s) => s.panY)
  const setZoomPan = useLayoutStore((s) => s.setZoomPan)
  const zoomIn = useLayoutStore((s) => s.zoomIn)
  const zoomOut = useLayoutStore((s) => s.zoomOut)
  const resetView = useLayoutStore((s) => s.resetView)

  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Map<number | string, Konva.Group>>(new Map())
  const transformerRef = useRef<Konva.Transformer>(null)
  const [imageSize, setImageSize] = useState({ width: 900, height: 650 })
  const [containerSize, setContainerSize] = useState({ width: 900, height: 650 })
  const [blockMenu, setBlockMenu] = useState<{ blockId: number | string; x: number; y: number } | null>(null)
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(
    null
  )
  const [renamingBlockId, setRenamingBlockId] = useState<number | string | null>(null)
  const [colorPicker, setColorPicker] = useState<{ blockId: number | string; x: number; y: number } | null>(null)
  const [addInstrumentAt, setAddInstrumentAt] = useState<{ x: number; y: number } | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const [panDragStart, setPanDragStart] = useState<{
    startClientX: number
    startClientY: number
    startPanX: number
    startPanY: number
  } | null>(null)

  // Keep the stage sized to whatever room the container actually has, so the (often much
  // larger, rendered at 2x for crispness) background image scales down to fit instead of
  // overflowing into scrollbars.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setContainerSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const fitScale = Math.min(containerSize.width / imageSize.width, containerSize.height / imageSize.height) || 1
  const offsetX = (containerSize.width - imageSize.width * fitScale) / 2
  const offsetY = (containerSize.height - imageSize.height * fitScale) / 2
  // zoomScale/panX/panY are user-driven view state layered on top of the auto fit-to-container
  // calc above — the fit calc keeps responding to window/container resizes independently of
  // whatever zoom/pan the user has dialed in.
  const finalScale = fitScale * zoomScale
  const finalX = offsetX + panX
  const finalY = offsetY + panY

  // Attach the resize/rotate handles only when exactly one block is selected — multi-select
  // group-resize semantics aren't part of this feature set, only group-drag.
  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    const onlyId = selectedBlockIds.size === 1 ? [...selectedBlockIds][0] : null
    const node = onlyId != null ? nodeRefs.current.get(onlyId) : null
    transformer.nodes(node ? [node] : [])
    transformer.getLayer()?.batchDraw()
  }, [selectedBlockIds, blocks.length])

  // Live-clamps the block during resize (called on every "transform" tick, unlike boundBoxFunc
  // which only sees the proposed box before Konva applies it): caps size so a block can never
  // end up larger than the room, then clamps position so the (possibly size-capped) box stays
  // within the room bounds. getClientRect gives the axis-aligned bounding box in the parent
  // Layer's local (room-pixel) space directly, accounting for the node's current rotation —
  // sidesteps hand-rolling rotated-box trig for this same "close enough" approximation the drag
  // clamp already uses (see clampCenterToRoom's doc comment in LayoutBlockIcon.tsx).
  function handleTransform(): void {
    if (selectedBlockIds.size !== 1) return
    const id = [...selectedBlockIds][0]
    const node = nodeRefs.current.get(id)
    const parent = node?.getParent()
    if (!node || !parent) return

    const rawRect = node.getClientRect({ relativeTo: parent })
    if (rawRect.width > imageSize.width || rawRect.height > imageSize.height) {
      const capScale = Math.min(imageSize.width / rawRect.width, imageSize.height / rawRect.height)
      node.scaleX(node.scaleX() * capScale)
      node.scaleY(node.scaleY() * capScale)
    }

    const rect = node.getClientRect({ relativeTo: parent })
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    const clampedCenter = clampCenterToRoom(center, rect.width / 2, rect.height / 2, imageSize)
    node.x(node.x() + (clampedCenter.x - center.x))
    node.y(node.y() + (clampedCenter.y - center.y))
  }

  function handleTransformEnd(): void {
    if (selectedBlockIds.size !== 1) return
    const id = [...selectedBlockIds][0]
    const node = nodeRefs.current.get(id)
    const block = blocks.find((b) => b.id === id)
    if (!node || !block) return
    // Konva accumulates resize as node scale — bake it into explicit width/height and reset
    // scale to 1 so the next transform doesn't compound on top of this one.
    const width = Math.max(8, block.width * node.scaleX())
    const height = Math.max(8, block.height * node.scaleY())
    node.scaleX(1)
    node.scaleY(1)
    // Resizing from a non-bottom-right handle moves the node's position live (to keep the
    // opposite anchor fixed) — previously this was never persisted, so the store's x/y silently
    // went stale and the block could snap back to its old position on the next re-render.
    updateBlockTransform(id, { x: node.x(), y: node.y(), width, height, rotation: node.rotation() })
  }

  // Space toggles pan-drag mode for the canvas; arrow keys nudge the selection by 1px (10px with
  // Shift). Both are deliberately fixed/non-rebindable (universal creative-tool conventions, and
  // arrow keys are too risky to remap given they're used for navigation elsewhere) — see
  // KEYBIND_ACTIONS' doc comment for the actions that ARE user-rebindable. Delete/Backspace for
  // removing selected blocks moved to SetupToolbar.tsx's unified keybind dispatcher (as
  // `delete-selection-layout`) so every rebindable shortcut has one home; this listener now only
  // owns the two fixed interactions. Both still need preventDefault(): Space scrolls the page,
  // arrows would otherwise scroll a scrollable ancestor.
  useEffect(() => {
    function isTextField(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (isTextField(e.target)) return
      if (e.code === 'Space') {
        e.preventDefault()
        setSpaceHeld(true)
        return
      }
      if (selectedBlockIds.size === 0) return
      // Arrow-key nudge — gated on `active` (Layout Mode actually visible) since the stage stays
      // mounted-but-hidden in Table Mode and a block selection can be left over from a prior
      // visit.
      const isArrow = e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      if (!isArrow || !active) return
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      if (selectedBlockIds.size === 1) {
        const id = [...selectedBlockIds][0]
        const block = blocks.find((b) => b.id === id)
        if (block) {
          const clamped = clampCenterToRoom(
            { x: block.x + dx, y: block.y + dy },
            block.width / 2,
            block.height / 2,
            imageSize
          )
          updateBlockTransform(id, { x: clamped.x, y: clamped.y })
        }
      } else {
        // Group nudge shifts every selected block by the same delta, unclamped — same accepted
        // simplification moveBlocksBy's own doc comment already describes for group-drag.
        moveBlocksBy([...selectedBlockIds], dx, dy)
      }
    }
    function handleKeyUp(e: KeyboardEvent): void {
      if (e.code === 'Space') setSpaceHeld(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [selectedBlockIds, active, blocks, imageSize, updateBlockTransform, moveBlocksBy])

  const renamingBlock = renamingBlockId != null ? blocks.find((b) => b.id === renamingBlockId) : null

  // Screen (clientX/Y) -> canvas coordinates, accounting for the stage's current scale/offset
  // (fit-to-container combined with user zoom/pan). Shared by drag-drop placement, the
  // empty-space "Add Instrument" menu, and marquee-select.
  function toCanvasCoords(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!containerRef.current || !stageRef.current) return null
    const rect = containerRef.current.getBoundingClientRect()
    const stage = stageRef.current
    const scale = stage.scaleX() || 1
    return { x: (clientX - rect.left - stage.x()) / scale, y: (clientY - rect.top - stage.y()) / scale }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData('application/json')
      if (!raw) return

      let payload: PaletteDragPayload
      try {
        payload = JSON.parse(raw)
      } catch {
        return
      }

      const pos = toCanvasCoords(e.clientX, e.clientY)
      if (!pos) return
      addBlock(payload.label, payload.shape, payload.color, pos.x, pos.y)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addBlock, stageRef]
  )

  function handleStageContextMenu(e: Konva.KonvaEventObject<PointerEvent>): void {
    e.evt.preventDefault()
    const pos = toCanvasCoords(e.evt.clientX, e.evt.clientY)
    if (!pos) return
    selectBlock(null)
    setCanvasMenu({ x: e.evt.clientX, y: e.evt.clientY, canvasX: pos.x, canvasY: pos.y })
  }

  // Dragging one block that's part of a larger selection carries the rest of the selection
  // along by the same delta; dragging a lone (or unselected) block just moves itself.
  function handleBlockDragEnd(block: { id: number | string; x: number; y: number }, x: number, y: number): void {
    if (selectedBlockIds.size > 1 && selectedBlockIds.has(block.id)) {
      moveBlocksBy([...selectedBlockIds], x - block.x, y - block.y)
    } else {
      updateBlockTransform(block.id, { x, y })
    }
  }

  // Empty-canvas mousedown starts either a pan-drag (Space held) or a marquee-select drag.
  function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (e.target !== e.target.getStage()) return
    if (spaceHeld) {
      setPanDragStart({ startClientX: e.evt.clientX, startClientY: e.evt.clientY, startPanX: panX, startPanY: panY })
      return
    }
    const pos = toCanvasCoords(e.evt.clientX, e.evt.clientY)
    if (!pos) return
    setMarquee({ startX: pos.x, startY: pos.y, x: pos.x, y: pos.y })
  }

  function handleStageMouseMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (panDragStart) {
      setZoomPan(
        zoomScale,
        panDragStart.startPanX + (e.evt.clientX - panDragStart.startClientX),
        panDragStart.startPanY + (e.evt.clientY - panDragStart.startClientY)
      )
      return
    }
    if (marquee) {
      const pos = toCanvasCoords(e.evt.clientX, e.evt.clientY)
      if (!pos) return
      setMarquee({ ...marquee, x: pos.x, y: pos.y })
    }
  }

  function handleStageMouseUp(): void {
    if (panDragStart) {
      setPanDragStart(null)
      return
    }
    if (marquee) {
      const width = Math.abs(marquee.x - marquee.startX)
      const height = Math.abs(marquee.y - marquee.startY)
      if (width < MARQUEE_THRESHOLD && height < MARQUEE_THRESHOLD) {
        // Negligible drag — treat as a plain click on empty canvas: deselect everything.
        selectBlock(null)
      } else {
        const left = Math.min(marquee.startX, marquee.x)
        const right = Math.max(marquee.startX, marquee.x)
        const top = Math.min(marquee.startY, marquee.y)
        const bottom = Math.max(marquee.startY, marquee.y)
        const matching = blocks
          .filter((b) => {
            const bLeft = b.x - b.width / 2
            const bRight = b.x + b.width / 2
            const bTop = b.y - b.height / 2
            const bBottom = b.y + b.height / 2
            return bLeft < right && bRight > left && bTop < bottom && bBottom > top
          })
          .map((b) => b.id)
        selectBlocksInRect(matching)
      }
      setMarquee(null)
    }
  }

  // Zoom toward the cursor: keep the content-space point currently under the cursor fixed on
  // screen as the scale changes, by solving for the new pan offset.
  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>): void {
    e.evt.preventDefault()
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const cursorX = e.evt.clientX - rect.left
    const cursorY = e.evt.clientY - rect.top
    const oldFinalScale = fitScale * zoomScale
    const contentX = (cursorX - finalX) / oldFinalScale
    const contentY = (cursorY - finalY) / oldFinalScale
    const factor = e.evt.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    const newZoomScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomScale * factor))
    const newFinalScale = fitScale * newZoomScale
    setZoomPan(newZoomScale, cursorX - contentX * newFinalScale - offsetX, cursorY - contentY * newFinalScale - offsetY)
  }

  return (
    <div
      ref={containerRef}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      style={{ width: '100%', height: '100%', overflow: 'hidden', background: 'var(--color-bg)', position: 'relative' }}
    >
      <div
        style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <button
          className="btn small"
          onClick={zoomOut}
          disabled={zoomScale <= MIN_ZOOM}
          aria-label="Zoom out"
        >
          <Icon name="minus" size={14} />
        </button>
        <span
          style={{ minWidth: 44, textAlign: 'center', fontSize: 12, color: 'var(--color-text-dim)', userSelect: 'none' }}
        >
          {Math.round(zoomScale * 100)}%
        </span>
        <button
          className="btn small"
          onClick={zoomIn}
          disabled={zoomScale >= MAX_ZOOM}
          aria-label="Zoom in"
        >
          <Icon name="plus" size={14} />
        </button>
        <button className="btn small" onClick={resetView} style={{ marginLeft: 4 }}>
          Reset view
        </button>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          zIndex: 10,
          fontSize: 12,
          color: 'var(--color-text-dim)',
          userSelect: 'none',
          pointerEvents: 'none'
        }}
      >
        Scroll to zoom · Space-drag to pan · Drag to select
      </div>
      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        scaleX={finalScale}
        scaleY={finalScale}
        x={finalX}
        y={finalY}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={() => {
          setPanDragStart(null)
          setMarquee(null)
        }}
        onWheel={handleWheel}
        onContextMenu={handleStageContextMenu}
      >
        <Layer>
          <LayoutBackground studioId={studioId} onSize={(width, height) => setImageSize({ width, height })} />
        </Layer>
        <Layer>
          {blocks.map((block) => (
            <LayoutBlockIcon
              key={block.id}
              ref={(node) => {
                if (node) nodeRefs.current.set(block.id, node)
                else nodeRefs.current.delete(block.id)
              }}
              block={block}
              selected={selectedBlockIds.has(block.id)}
              imageSize={imageSize}
              onSelect={(additive) => (additive ? toggleBlock(block.id) : selectBlock(block.id))}
              onDragEnd={(x, y) => handleBlockDragEnd(block, x, y)}
              onContextMenu={(clientX, clientY) => setBlockMenu({ blockId: block.id, x: clientX, y: clientY })}
            />
          ))}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 8 || newBox.height < 8 ? oldBox : newBox)}
            onTransform={handleTransform}
            onTransformEnd={handleTransformEnd}
          />
          {marquee && (
            <Rect
              x={Math.min(marquee.startX, marquee.x)}
              y={Math.min(marquee.startY, marquee.y)}
              width={Math.abs(marquee.x - marquee.startX)}
              height={Math.abs(marquee.y - marquee.startY)}
              fill="rgba(79, 124, 172, 0.2)"
              stroke="#4f7cac"
              strokeWidth={1 / finalScale}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
      {blockMenu && (
        <ContextMenu
          x={blockMenu.x}
          y={blockMenu.y}
          items={[
            { label: 'Rename', onClick: () => setRenamingBlockId(blockMenu.blockId) },
            {
              label: 'Change Color',
              onClick: () => setColorPicker({ blockId: blockMenu.blockId, x: blockMenu.x, y: blockMenu.y })
            },
            { label: 'Delete', onClick: () => removeBlocks([blockMenu.blockId]) }
          ]}
          onClose={() => setBlockMenu(null)}
        />
      )}
      {canvasMenu && (
        <ContextMenu
          x={canvasMenu.x}
          y={canvasMenu.y}
          items={[
            {
              label: 'Add Instrument',
              onClick: () => setAddInstrumentAt({ x: canvasMenu.canvasX, y: canvasMenu.canvasY })
            }
          ]}
          onClose={() => setCanvasMenu(null)}
        />
      )}
      {renamingBlock && (
        <RenameBlockModal
          initialLabel={renamingBlock.label}
          onClose={() => setRenamingBlockId(null)}
          onConfirm={(label) => renameBlock(renamingBlock.id, label)}
        />
      )}
      {colorPicker &&
        (() => {
          const block = blocks.find((b) => b.id === colorPicker.blockId)
          if (!block) return null
          return (
            <ChangeColorPopover
              x={colorPicker.x}
              y={colorPicker.y}
              initialColor={block.color}
              onChange={(color) => updateBlockColor(colorPicker.blockId, color)}
              onClose={() => setColorPicker(null)}
            />
          )
        })()}
      {addInstrumentAt && (
        <CustomBlockModal
          onClose={() => setAddInstrumentAt(null)}
          onConfirm={(title, color) => addBlock(title, 'rect', color, addInstrumentAt.x, addInstrumentAt.y)}
        />
      )}
    </div>
  )
}
