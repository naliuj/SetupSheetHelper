import { useCallback, useEffect, useRef, useState } from 'react'
import { Stage, Layer, Transformer } from 'react-konva'
import type Konva from 'konva'
import { useLayoutStore } from '@renderer/state/layoutStore'
import LayoutBackground from './LayoutBackground'
import LayoutBlockIcon from './LayoutBlockIcon'
import ContextMenu from './ContextMenu'
import RenameBlockModal from './RenameBlockModal'
import CustomBlockModal from '../palette/CustomBlockModal'

interface Props {
  studioId: number
  stageRef: React.RefObject<Konva.Stage | null>
}

interface PaletteDragPayload {
  label: string
  shape: 'rect' | 'circle'
  color: string
}

export default function LayoutStage({ studioId, stageRef }: Props): JSX.Element {
  const blocks = useLayoutStore((s) => s.blocks)
  const addBlock = useLayoutStore((s) => s.addBlock)
  const updateBlockTransform = useLayoutStore((s) => s.updateBlockTransform)
  const renameBlock = useLayoutStore((s) => s.renameBlock)
  const removeBlock = useLayoutStore((s) => s.removeBlock)
  const selectBlock = useLayoutStore((s) => s.selectBlock)
  const selectedBlockId = useLayoutStore((s) => s.selectedBlockId)

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
  const [addInstrumentAt, setAddInstrumentAt] = useState<{ x: number; y: number } | null>(null)

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

  // Attach the resize/rotate handles to whichever block is currently selected.
  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    const node = selectedBlockId != null ? nodeRefs.current.get(selectedBlockId) : null
    transformer.nodes(node ? [node] : [])
    transformer.getLayer()?.batchDraw()
  }, [selectedBlockId, blocks.length])

  function handleTransformEnd(): void {
    if (selectedBlockId == null) return
    const node = nodeRefs.current.get(selectedBlockId)
    const block = blocks.find((b) => b.id === selectedBlockId)
    if (!node || !block) return
    // Konva accumulates resize as node scale — bake it into explicit width/height and reset
    // scale to 1 so the next transform doesn't compound on top of this one.
    const width = Math.max(8, block.width * node.scaleX())
    const height = Math.max(8, block.height * node.scaleY())
    node.scaleX(1)
    node.scaleY(1)
    updateBlockTransform(selectedBlockId, { width, height, rotation: node.rotation() })
  }

  // Backspace/Delete removes the selected block, unless focus is in a text field (e.g. the
  // rename modal or a palette input) where those keys should edit text instead.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (selectedBlockId == null) return
      if (e.key !== 'Backspace' && e.key !== 'Delete') return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      e.preventDefault()
      removeBlock(selectedBlockId)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedBlockId, removeBlock])

  const renamingBlock = renamingBlockId != null ? blocks.find((b) => b.id === renamingBlockId) : null

  // Screen (clientX/Y) -> canvas coordinates, accounting for the stage's fit-to-container
  // scale/offset. Shared by drag-drop placement and the empty-space "Add Instrument" menu.
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

  return (
    <div
      ref={containerRef}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#111417' }}
    >
      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        scaleX={fitScale}
        scaleY={fitScale}
        x={offsetX}
        y={offsetY}
        onMouseDown={(e) => {
          if (e.target === e.target.getStage()) selectBlock(null)
        }}
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
              selected={selectedBlockId === block.id}
              onSelect={() => selectBlock(block.id)}
              onDragEnd={(x, y) => updateBlockTransform(block.id, { x, y })}
              onContextMenu={(clientX, clientY) => setBlockMenu({ blockId: block.id, x: clientX, y: clientY })}
            />
          ))}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 8 || newBox.height < 8 ? oldBox : newBox)}
            onTransformEnd={handleTransformEnd}
          />
        </Layer>
      </Stage>
      {blockMenu && (
        <ContextMenu
          x={blockMenu.x}
          y={blockMenu.y}
          items={[
            { label: 'Rename', onClick: () => setRenamingBlockId(blockMenu.blockId) },
            { label: 'Delete', onClick: () => removeBlock(blockMenu.blockId) }
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
      {addInstrumentAt && (
        <CustomBlockModal
          onClose={() => setAddInstrumentAt(null)}
          onConfirm={(title, color) => addBlock(title, 'rect', color, addInstrumentAt.x, addInstrumentAt.y)}
        />
      )}
    </div>
  )
}
