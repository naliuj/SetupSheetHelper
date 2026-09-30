import { useCallback, useEffect, useRef, useState } from 'react'
import { useThemeColor } from '@renderer/hooks/useThemeColor'
import { Stage, Layer, Line, Rect, Shape, Transformer } from 'react-konva'
import type Konva from 'konva'
import { MIN_ZOOM, MAX_ZOOM } from '@renderer/state/layoutStore'
import { useLayoutStoreState } from '@renderer/state/layoutStoreContext'
import { useSetupStoreState } from '@renderer/state/setupStoreContext'
import LayoutBackground from './LayoutBackground'
import LayoutBlockIcon, { clampCenterToRoom, rotatedHalfExtents } from './LayoutBlockIcon'
import LayoutNote from './LayoutNote'
import LayoutMark from './LayoutMark'
import MarkupToolbar from './MarkupToolbar'
import { useMarkupDrawing } from './useMarkupDrawing'
import { scaleMarkData } from './markGeometry'
import { useMarkupPrefsStore } from '@renderer/state/markupPrefsStore'
import { Eye, EyeOff, PenLine } from 'lucide-react'
import NoteEditor, { noteScreenGeometry, type StageView } from './NoteEditor'
import NoteFormatBar from './NoteFormatBar'
import { fitNoteHeight } from './noteLayout'
import { buildSnapTargets, computeSnap, type SnapGuide, type SnapTargets } from './snapGuides'
import { haptic } from '@renderer/utils/haptics'
import { useSnapPrefsStore } from '@renderer/state/snapPrefsStore'
import { NOTE_DEFAULT_HEIGHT, NOTE_DEFAULT_WIDTH, type NotePreset } from '@shared/constants/layoutNotes'
import ContextMenu from './ContextMenu'
import CustomBlockModal from '../palette/CustomBlockModal'
import Icon from '@renderer/components/Icon'

/** The box shape Konva's Transformer hands to boundBoxFunc (rotation in radians). */
interface TransformBox {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

interface Props {
  studioId: number
  stageRef: React.RefObject<Konva.Stage | null>
  /** Whether Layout Mode is the currently-visible mode. The stage stays mounted (hidden) in
   *  Table Mode too (see SetupEditorPane.tsx), so the arrow-key nudge below is gated on this — a
   *  layout block left selected from a prior visit shouldn't silently move while the user is
   *  looking at the table. (Delete/Backspace here is intentionally NOT gated the same way —
   *  pre-existing behavior, unrelated to this change.) Deliberately NOT combined with paneActive
   *  below into one flag — this one also drives Konva's own click/drag/select interactivity via
   *  downstream props, and an inactive Split View pane must stay clickable so the user can click
   *  into it to make it the active pane. */
  active: boolean
  /** False when this stage belongs to Split View's inactive pane — gates window-level keyboard
   *  input (arrow-nudge, Space-to-pan) so a key press only affects whichever pane the user last
   *  interacted with, even if both panes are simultaneously in Layout Mode (in which case both
   *  would otherwise have `active: true` and both listeners would fire on one keypress). Defaults
   *  to true so every caller outside Split View is unaffected. */
  paneActive?: boolean
}

interface PaletteDragPayload {
  label: string
  shape: 'rect' | 'circle'
  color: string
  /** Optional default placed size from the palette item (null/absent → addBlock's square default). */
  defaultWidth?: number | null
  defaultHeight?: number | null
  /** The palette item's default label color, copied onto the new block. null/absent → Auto. */
  labelColor?: string | null
  /** Set by the palette's Notes presets: drop a text note (opened for typing) instead of a block. */
  kind?: 'note'
  preset?: NotePreset
}

const ZOOM_STEP = 1.05
/** How close, in SCREEN pixels, a dragged edge or center has to come to a guide to snap onto it —
 *  converted to room pixels at the current zoom, so snapping feels the same at every zoom level. */
const SNAP_THRESHOLD_PX = 6
/** Smart-guide color: magenta, the convention in design tools, and clear of the blue that already
 *  means "selected" on this canvas. */
const SNAP_GUIDE_COLOR = '#e0379c'
/** Angles a rotation snaps to (within ROTATION_SNAP_TOLERANCE degrees), each with a trackpad tap. */
const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315]
const ROTATION_SNAP_TOLERANCE = 5
/** How long a pinch holds at 100% after crossing it, so the stop is felt as a notch rather than
 *  flown past. */
const ZOOM_DETENT_HOLD_MS = 200
/** The shortest gap between two snap taps. A drag sweeping across a crowded plan catches lines in
 *  quick succession, and a tap for every one blurred into a buzz; the snapping itself still
 *  happens every time, only the taps are spaced. */
const SNAP_TAP_MIN_INTERVAL_MS = 100

/** The snap angle a rotation (in degrees, any range) sits exactly on, or null. */
function rotationSnapAt(rotation: number): number | null {
  const angle = ((rotation % 360) + 360) % 360
  return ROTATION_SNAPS.find((a) => Math.abs(angle - a) < 0.01 || Math.abs(angle - 360 - a) < 0.01) ?? null
}
const MARQUEE_THRESHOLD = 5

export default function LayoutStage({ studioId, stageRef, active, paneActive = true }: Props): JSX.Element {
  // Konva draws to a canvas and cannot use var(), so the accent has to be resolved to a literal.
  const accent = useThemeColor('--color-accent')
  // A translucent wash with a SOLID edge. Node opacity would dim the stroke along with the fill,
  // so the alpha goes on the fill color itself (#RRGGBBAA, which canvas accepts) and the stroke
  // stays at full strength. Falls back to the flat accent if the token is ever not a 6-digit hex.
  const marqueeFill = /^#[0-9a-fA-F]{6}$/.test(accent) ? `${accent}2e` : accent
  const setupId = useSetupStoreState((s) => s.setupId)
  const blocks = useLayoutStoreState((s) => s.blocks)
  const addBlock = useLayoutStoreState((s) => s.addBlock)
  const updateBlockTransform = useLayoutStoreState((s) => s.updateBlockTransform)
  const updateBlock = useLayoutStoreState((s) => s.updateBlock)
  const removeBlocks = useLayoutStoreState((s) => s.removeBlocks)
  const duplicateBlocks = useLayoutStoreState((s) => s.duplicateBlocks)
  const moveBlocksBy = useLayoutStoreState((s) => s.moveBlocksBy)
  const selectBlock = useLayoutStoreState((s) => s.selectBlock)
  const toggleBlock = useLayoutStoreState((s) => s.toggleBlock)
  const selectBlocksInRect = useLayoutStoreState((s) => s.selectBlocksInRect)
  const selectedBlockIds = useLayoutStoreState((s) => s.selectedBlockIds)
  const zoomScale = useLayoutStoreState((s) => s.zoomScale)
  const panX = useLayoutStoreState((s) => s.panX)
  const panY = useLayoutStoreState((s) => s.panY)
  const setZoomPan = useLayoutStoreState((s) => s.setZoomPan)
  const zoomIn = useLayoutStoreState((s) => s.zoomIn)
  const zoomOut = useLayoutStoreState((s) => s.zoomOut)
  const resetView = useLayoutStoreState((s) => s.resetView)
  const beginGesture = useLayoutStoreState((s) => s.beginGesture)
  const endGesture = useLayoutStoreState((s) => s.endGesture)
  const gestureActive = useLayoutStoreState((s) => s.gestureStartedAt != null)
  const noteEdit = useLayoutStoreState((s) => s.noteEdit)
  const noteRequest = useLayoutStoreState((s) => s.noteRequest)
  const startNewNote = useLayoutStoreState((s) => s.startNewNote)
  const startNoteEdit = useLayoutStoreState((s) => s.startNoteEdit)
  const setNoteEditText = useLayoutStoreState((s) => s.setNoteEditText)
  const patchNoteEdit = useLayoutStoreState((s) => s.patchNoteEdit)
  const commitNoteEdit = useLayoutStoreState((s) => s.commitNoteEdit)
  const formatBarRef = useRef<HTMLDivElement | null>(null)
  const markupOn = useLayoutStoreState((s) => s.markupOn)
  const markupHidden = useLayoutStoreState((s) => s.markupHidden)
  const setMarkupOn = useLayoutStoreState((s) => s.setMarkupOn)
  const setMarkupHidden = useLayoutStoreState((s) => s.setMarkupHidden)
  const addMark = useLayoutStoreState((s) => s.addMark)
  const applyErase = useLayoutStoreState((s) => s.applyErase)
  const markupTool = useMarkupPrefsStore((s) => s.tool)
  const markupColor = useMarkupPrefsStore((s) => s.color)
  const markupSize = useMarkupPrefsStore((s) => s.size)
  const setMarkupPrefs = useMarkupPrefsStore((s) => s.set)
  useEffect(() => {
    void useMarkupPrefsStore.getState().load()
  }, [])
  const previewRef = useRef<Konva.Shape | null>(null)
  // Snap guides for the drag in progress: the lines computed once at drag start, the current snap
  // on each axis (so a tap only fires when it changes), and whether ⌘ is held to move freely.
  const snapTargetsRef = useRef<SnapTargets | null>(null)
  const snapStateRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null })
  const metaHeldRef = useRef(false)
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])
  const lastRotationSnapRef = useRef<number | null>(null)
  const zoomDetentUntilRef = useRef(0)
  const lastSnapTapRef = useRef(0)
  const snapEnabled = useSnapPrefsStore((s) => s.enabled)
  const setSnapEnabled = useSnapPrefsStore((s) => s.setEnabled)
  useEffect(() => {
    void useSnapPrefsStore.getState().load()
  }, [])

  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Map<number | string, Konva.Group>>(new Map())
  // One Transformer per selected block (not one shared Transformer across the whole selection) —
  // each block keeps its own independent resize/rotate handles around its own bounds, so a
  // multi-selection never shows one combined bounding box spanning the gap between blocks.
  const transformerRefs = useRef<Map<number | string, Konva.Transformer>>(new Map())
  // The handle grabbed at the start of the current resize — see boundTransformBox.
  const grabbedAnchorRef = useRef<string | null>(null)
  const [imageSize, setImageSize] = useState({ width: 900, height: 650 })
  const [containerSize, setContainerSize] = useState({ width: 900, height: 650 })
  const [blockMenu, setBlockMenu] = useState<{ blockId: number | string; x: number; y: number } | null>(null)
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(
    null
  )
  const [editingBlockId, setEditingBlockId] = useState<number | string | null>(null)
  const [addInstrumentAt, setAddInstrumentAt] = useState<{ x: number; y: number } | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const [panDragStart, setPanDragStart] = useState<{
    startClientX: number
    startClientY: number
    startPanX: number
    startPanY: number
  } | null>(null)

  // Release the gesture gate if this stage goes away mid-drag. Konva's end callbacks only fire
  // while the component is alive, so unmounting during a drag (mode switch, Split View close,
  // switching setups) would otherwise leave layoutStore latched and silently drop every
  // subsequent save. Harmless when no gesture is in progress.
  useEffect(() => endGesture, [endGesture])

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
  const view: StageView = { scale: finalScale, x: finalX, y: finalY }

  // A drawing tool is in hand: the canvas takes strokes, and blocks, notes and marks stop answering
  // clicks so a stroke can start on top of one without grabbing it.
  const drawing = active && markupOn && markupTool !== 'select'
  const markup = useMarkupDrawing({
    tool: markupTool,
    color: markupColor,
    size: markupSize,
    drawing,
    markupOn: active && markupOn,
    blocks,
    finalScale,
    roomSize: imageSize,
    toCanvasCoords: (clientX, clientY) => toCanvasCoords(clientX, clientY),
    nodeRefs,
    previewRef,
    addMark,
    applyErase,
    beginGesture,
    endGesture
  })
  const hasMarks = blocks.some((b) => b.kind === 'mark')

  // ⌘ turns snapping off for as long as it is held, including mid-drag. Tracked here because Konva
  // hands dragBoundFunc a position and no event.
  useEffect(() => {
    const update = (e: KeyboardEvent): void => {
      metaHeldRef.current = e.metaKey
    }
    const release = (): void => {
      metaHeldRef.current = false
    }
    window.addEventListener('keydown', update)
    window.addEventListener('keyup', update)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', update)
      window.removeEventListener('keyup', update)
      window.removeEventListener('blur', release)
    }
  }, [])

  /** Collects what a drag of `id` can snap to — every block not moving with it — once, at the start
   *  of the drag, rather than on every pointer move. */
  function startSnap(id: number | string): void {
    if (!snapEnabled) {
      snapTargetsRef.current = null
      return
    }
    const moving = selectedBlockIds.has(id) ? selectedBlockIds : new Set([id])
    const boxes = blocks
      .filter((b) => !moving.has(b.id))
      .map((b) => ({ center: { x: b.x, y: b.y }, ...rotatedHalfExtents(b.width, b.height, b.rotation) }))
    snapTargetsRef.current = buildSnapTargets(boxes, imageSize)
    snapStateRef.current = { x: null, y: null }
  }

  function endSnap(): void {
    snapTargetsRef.current = null
    snapStateRef.current = { x: null, y: null }
    setSnapGuides([])
  }

  /** The dragBoundFunc hook: moves the dragged block's center onto a nearby guide, draws the
   *  guides, and taps the trackpad each time a new line is caught. */
  function snapDrag(id: number | string, center: { x: number; y: number }): { x: number; y: number } {
    const targets = snapTargetsRef.current
    const block = blocks.find((b) => b.id === id)
    if (!targets || !block || metaHeldRef.current) {
      if (snapStateRef.current.x != null || snapStateRef.current.y != null) {
        snapStateRef.current = { x: null, y: null }
        setSnapGuides([])
      }
      return center
    }
    const result = computeSnap(
      { center, ...rotatedHalfExtents(block.width, block.height, block.rotation) },
      targets,
      SNAP_THRESHOLD_PX / finalScale
    )
    const prev = snapStateRef.current
    const caughtNewLine =
      (result.snappedX != null && result.snappedX !== prev.x) || (result.snappedY != null && result.snappedY !== prev.y)
    if (caughtNewLine && performance.now() - lastSnapTapRef.current >= SNAP_TAP_MIN_INTERVAL_MS) {
      lastSnapTapRef.current = performance.now()
      haptic('alignment')
    }
    if (result.snappedX !== prev.x || result.snappedY !== prev.y) {
      snapStateRef.current = { x: result.snappedX, y: result.snappedY }
      setSnapGuides(result.guides)
    }
    return result.center
  }

  /** Opens the editor on a new note centered at `center`, pulled inside the room. */
  function placeNote(preset: NotePreset, center: { x: number; y: number }): void {
    startNewNote(preset, clampCenterToRoom(center, NOTE_DEFAULT_WIDTH / 2, NOTE_DEFAULT_HEIGHT / 2, imageSize))
  }

  // The palette's note buttons and the Add Text Note keybind can't know where the view is, so they
  // leave a request in the store (see noteRequest) and the note is placed in the middle of what is
  // on screen here. Remembering the request already seen at mount keeps a stage that remounts
  // (mode switch, Split View) from replaying an old one.
  const seenNoteRequestRef = useRef(noteRequest?.seq ?? 0)
  useEffect(() => {
    if (!noteRequest || noteRequest.seq === seenNoteRequestRef.current) return
    seenNoteRequestRef.current = noteRequest.seq
    // Step down and to the right past any note already sitting in the middle, so adding a few in a
    // row doesn't stack them exactly on top of each other.
    const center = { x: (containerSize.width / 2 - finalX) / finalScale, y: (containerSize.height / 2 - finalY) / finalScale }
    const occupied = (c: { x: number; y: number }): boolean =>
      blocks.some((b) => b.kind === 'note' && Math.abs(b.x - c.x) < 12 && Math.abs(b.y - c.y) < 12)
    for (let i = 0; i < 20 && occupied(center); i++) {
      center.x += 24
      center.y += 24
    }
    placeNote(noteRequest.preset, center)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteRequest])

  // Whatever takes this stage away mid-edit (mode switch, switching setups, closing a Split View
  // pane) keeps the text rather than dropping it.
  useEffect(() => commitNoteEdit, [commitNoteEdit])

  // Attach each selected block's own Transformer to just that one block's node.
  const selectedBlocksSizeKey = [...selectedBlockIds]
    .map((id) => {
      const b = blocks.find((bl) => bl.id === id)
      return b ? `${id}:${b.width}x${b.height}` : ''
    })
    .join('|')
  useEffect(() => {
    for (const id of selectedBlockIds) {
      const transformer = transformerRefs.current.get(id)
      const node = nodeRefs.current.get(id)
      if (!transformer) continue
      if (!node) {
        // The selection can outlive the node briefly (a block replaced under a new id). Detach
        // rather than skip: a Transformer keeps painting handles for whatever it last held, even
        // after that node is destroyed.
        transformer.nodes([])
        continue
      }
      // Konva's Transformer only auto-tracks attribute changes on the node it's directly attached
      // to (this Group) — but width/height actually live on the child Rect/Circle inside it (see
      // LayoutBlockIcon.tsx), so a resize's width/height commit never fires the listeners
      // Transformer relies on to recompute its handle box. Re-calling .nodes() (which resets its
      // internal bounding-box cache) whenever the selected block's own width/height change works
      // around that — without this, handles only refresh on deselect/reselect.
      transformer.nodes([node])
    }
    transformerRefs.current.forEach((t) => t.getLayer()?.batchDraw())
  }, [selectedBlockIds, blocks.length, selectedBlocksSizeKey])

  // Every limit on the block being resized or rotated lives here, in the Transformer's
  // boundBoxFunc: Konva asks it to approve each proposed box before applying it, so the node never
  // has to be corrected afterward. (It used to be — handleTransform rescaled and moved the node on
  // every tick, which fought the Transformer's own math: a block stretched to a wall got thinner
  // on the other axis, and at extremes it jumped out of the room.)
  //
  // Konva passes boxes in absolute stage pixels, rotated (radians) around their top-left corner.
  // The corners are mapped into the Layer's room-pixel space, which covers zoom and pan.
  function boundTransformBox(id: number | string, oldBox: TransformBox, newBox: TransformBox): TransformBox {
    // Konva switches which handle is being dragged once it's pulled past the opposite edge
    // (renaming the Transformer's internal _movingAnchorName before this function runs), so a
    // corner dragged toward another corner jumped to that corner. Put the grabbed handle back and
    // hold the box where it was. Relies on a Konva 9 internal; safe while `padding` stays at its
    // default 0, which makes Konva's accompanying drag-offset adjustment zero.
    const transformer = transformerRefs.current.get(id) as unknown as { _movingAnchorName: string | null } | undefined
    const grabbed = grabbedAnchorRef.current
    if (transformer && grabbed && transformer._movingAnchorName !== grabbed) {
      transformer._movingAnchorName = grabbed
      return oldBox
    }

    const layer = nodeRefs.current.get(id)?.getParent()
    if (!layer) return newBox
    const toRoom = layer.getAbsoluteTransform().copy().invert()
    const layerScale = layer.getAbsoluteScale().x || 1
    if (newBox.width / layerScale < 8 || newBox.height / layerScale < 8) return oldBox

    // How far a box's corners reach past the room's edges, in room pixels (0 when inside).
    function overflow(box: TransformBox): number {
      const cos = Math.cos(box.rotation)
      const sin = Math.sin(box.rotation)
      const corners = [
        [0, 0],
        [box.width, 0],
        [0, box.height],
        [box.width, box.height]
      ].map(([w, h]) => toRoom.point({ x: box.x + w * cos - h * sin, y: box.y + w * sin + h * cos }))
      const xs = corners.map((c) => c.x)
      const ys = corners.map((c) => c.y)
      return Math.max(
        0,
        -Math.min(...xs),
        Math.max(...xs) - imageSize.width,
        -Math.min(...ys),
        Math.max(...ys) - imageSize.height
      )
    }
    const EPSILON = 0.5
    if (overflow(newBox) <= EPSILON) return newBox
    // Already outside (e.g. a block placed before this clamp existed): allow anything that doesn't
    // make it worse, so it can still be shrunk or rotated back in.
    const oldOverflow = overflow(oldBox)
    if (oldOverflow > EPSILON) return overflow(newBox) <= oldOverflow ? newBox : oldBox

    // Go as far from oldBox toward newBox as still fits. Only the axis being dragged differs
    // between the two, so a resize stops at the wall without touching the other dimension, and
    // a rotation stops where a corner would cross the edge.
    // Take the short way round when a rotation crosses ±180°, which Konva reports as a ~2π jump.
    const rotationDelta = Math.atan2(
      Math.sin(newBox.rotation - oldBox.rotation),
      Math.cos(newBox.rotation - oldBox.rotation)
    )
    const lerp = (t: number): TransformBox => ({
      x: oldBox.x + (newBox.x - oldBox.x) * t,
      y: oldBox.y + (newBox.y - oldBox.y) * t,
      width: oldBox.width + (newBox.width - oldBox.width) * t,
      height: oldBox.height + (newBox.height - oldBox.height) * t,
      rotation: oldBox.rotation + rotationDelta * t
    })
    let lo = 0
    let hi = 1
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      if (overflow(lerp(mid)) <= EPSILON) lo = mid
      else hi = mid
    }
    return lerp(lo)
  }

  // If the block being resized is part of a larger selection, every other selected block's
  // scale/rotation is mirrored live (direct Konva mutation, bypassing React/the store, same
  // approach as handleBlockDragMove) so the whole selection visibly resizes/rotates together in
  // real time instead of the rest jumping into place only once the gesture ends. Followers aren't
  // clamped live here (matching the existing drag-follower simplification) — handleTransformEnd
  // caps each one to the room bounds once the gesture finishes. Each follower scales/rotates
  // around its own center automatically (LayoutBlockIcon's offsetX/offsetY makes a node's own
  // x/y the pivot for both), so mirroring the same scale/rotation values onto a different-sized
  // block elsewhere just works without extra math.
  function handleTransform(id: number | string): void {
    const node = nodeRefs.current.get(id)
    if (!node) return
    // A tap each time a rotation lands on one of the snap angles — once per angle, not per tick
    // spent sitting on it.
    if (grabbedAnchorRef.current === 'rotater') {
      const onSnap = rotationSnapAt(node.rotation())
      if (onSnap != null && onSnap !== lastRotationSnapRef.current) haptic('alignment')
      lastRotationSnapRef.current = onSnap
    }
    if (selectedBlockIds.size > 1 && selectedBlockIds.has(id)) {
      const block = blocks.find((b) => b.id === id)
      if (block) {
        const rotationDelta = node.rotation() - block.rotation
        for (const otherId of selectedBlockIds) {
          if (otherId === id) continue
          const otherNode = nodeRefs.current.get(otherId)
          const other = blocks.find((b) => b.id === otherId)
          if (!otherNode || !other) continue
          otherNode.scaleX(node.scaleX())
          otherNode.scaleY(node.scaleY())
          otherNode.rotation(other.rotation + rotationDelta)
        }
      }
    }
    stageRef.current?.batchDraw()
  }

  // Bakes the active block's resize/rotation into width/height/rotation, then — if it's part of a
  // larger selection — commits the same proportional scale factor and rotation delta to the
  // store for every other selected block (each capped to the room bounds individually), matching
  // what handleTransform already mirrored live.
  function handleTransformEnd(id: number | string): void {
    const node = nodeRefs.current.get(id)
    const block = blocks.find((b) => b.id === id)
    if (!node) return
    if (!block) {
      // Nothing to commit to, but the gesture still left scale on the node. Reset it, or the next
      // handle grab compounds on top of a resize that was never recorded.
      node.scaleX(1)
      node.scaleY(1)
      return
    }
    // Konva accumulates resize as node scale — bake it into explicit width/height and reset
    // scale to 1 so the next transform doesn't compound on top of this one.
    // abs(): a flip is prevented (see boundTransformBox), but a negative scale baked in here
    // would collapse the block to the 8px minimum on both axes.
    const width = Math.max(8, block.width * Math.abs(node.scaleX()))
    // A note's height isn't dragged — it follows its text, and the store refits it to the width.
    const height = block.kind === 'note' ? block.height : Math.max(8, block.height * Math.abs(node.scaleY()))
    const rotation = node.rotation()
    node.scaleX(1)
    node.scaleY(1)
    // A mark's drawing is stored in its own box's coordinates, so a resize stretches the points
    // along with the box — otherwise the box would grow around a drawing that stayed put.
    const markData = block.kind === 'mark' && block.markData
      ? scaleMarkData(block.markData, width / block.width, height / block.height)
      : undefined
    // Resizing from a non-bottom-right handle moves the node's position live (to keep the
    // opposite anchor fixed) — previously this was never persisted, so the store's x/y silently
    // went stale and the block could snap back to its old position on the next re-render.
    updateBlockTransform(id, { x: node.x(), y: node.y(), width, height, rotation, ...(markData ? { markData } : {}) })

    if (selectedBlockIds.size <= 1 || !selectedBlockIds.has(id)) return
    const scaleX = width / block.width
    const scaleY = height / block.height
    const rotationDelta = rotation - block.rotation
    if (scaleX === 1 && scaleY === 1 && rotationDelta === 0) return
    for (const otherId of selectedBlockIds) {
      if (otherId === id) continue
      const otherNode = nodeRefs.current.get(otherId)
      const other = blocks.find((b) => b.id === otherId)
      if (!other) continue
      const otherWidth = Math.max(8, Math.min(imageSize.width, other.width * scaleX))
      const otherHeight = Math.max(8, Math.min(imageSize.height, other.height * scaleY))
      const otherRotation = other.rotation + rotationDelta
      const { halfWidth, halfHeight } = rotatedHalfExtents(otherWidth, otherHeight, otherRotation)
      const clampedCenter = clampCenterToRoom({ x: other.x, y: other.y }, halfWidth, halfHeight, imageSize)
      updateBlockTransform(otherId, {
        ...clampedCenter,
        width: otherWidth,
        height: otherHeight,
        rotation: otherRotation,
        ...(other.kind === 'mark' && other.markData
          ? { markData: scaleMarkData(other.markData, otherWidth / other.width, otherHeight / other.height) }
          : {})
      })
      // handleTransform left this node's scale/rotation set imperatively mid-mirror — reset scale
      // now that the resize is baked into width/height in the store (matching the active node's
      // own reset above), so the next render's width/height props aren't compounded with leftover
      // scale. Rotation stays as the final committed value rather than resetting.
      if (otherNode) {
        otherNode.scaleX(1)
        otherNode.scaleY(1)
        otherNode.rotation(otherRotation)
      }
    }
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
      // Split View: neither Space-to-pan nor arrow-nudge should apply to a pane the user isn't
      // currently interacting with, even if both panes are in Layout Mode at once (see paneActive's
      // doc comment on Props above).
      if (!paneActive) return
      // Gated on `active` for the same reason the arrow-nudge below is: the stage stays
      // mounted-but-hidden in Table Mode, and this branch calls preventDefault() unconditionally.
      // Preventing default on a Space keydown suppresses the activation click of whatever button
      // has focus, so a hidden Layout stage was silently swallowing Space for the whole app. That
      // went unnoticed while every Table Mode control was an <input> (exempted by isTextField
      // above); the setup sheet's row-select button is the first one that is not.
      if (e.code === 'Space') {
        if (!active) return
        e.preventDefault()
        setSpaceHeld(true)
        return
      }
      // Escape puts the pen down. (The tool letters are rebindable keybinds, in the 'markup' scope.)
      if (markupOn && active && e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setMarkupOn(false)
        return
      }
      if (selectedBlockIds.size === 0) return
      // Enter types into the one selected note — the keyboard counterpart of double-clicking it.
      // Only from the canvas itself (nothing focused, or focus inside the stage): Enter on a
      // focused button elsewhere is that button's.
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey && active && selectedBlockIds.size === 1) {
        const target = e.target as Node | null
        const fromCanvas = target === document.body || (!!target && !!containerRef.current?.contains(target))
        const id = [...selectedBlockIds][0]
        if (fromCanvas && blocks.find((b) => b.id === id)?.kind === 'note') {
          e.preventDefault()
          startNoteEdit(id)
        }
        return
      }
      // Arrow-key nudge — gated on `active` (Layout Mode actually visible) since the stage stays
      // mounted-but-hidden in Table Mode and a block selection can be left over from a prior
      // visit.
      const isArrow = e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      if (!isArrow || !active) return
      // Bare and Shift-arrows only. Cmd/Ctrl- and Alt-arrows belong to the rebindable actions
      // (Select Next/Previous Block defaults to CmdOrCtrl+Arrow), and nudging as well would both
      // move the block and change the selection on one keypress.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      if (selectedBlockIds.size === 1) {
        const id = [...selectedBlockIds][0]
        const block = blocks.find((b) => b.id === id)
        if (block) {
          const { halfWidth, halfHeight } = rotatedHalfExtents(block.width, block.height, block.rotation)
          const clamped = clampCenterToRoom({ x: block.x + dx, y: block.y + dy }, halfWidth, halfHeight, imageSize)
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
  }, [selectedBlockIds, active, paneActive, blocks, imageSize, updateBlockTransform, moveBlocksBy, startNoteEdit, markupOn, setMarkupOn, setMarkupPrefs])

  const editingBlock = editingBlockId != null ? blocks.find((b) => b.id === editingBlockId) : null

  const noteIds = new Set(blocks.filter((b) => b.kind === 'note').map((b) => b.id))
  const selectedNote =
    selectedBlockIds.size === 1 ? blocks.find((b) => b.id === [...selectedBlockIds][0] && b.kind === 'note') : undefined
  // The format bar follows the note being typed, or else the one selected note. Hidden mid-drag or
  // mid-resize: it would sit at the note's old position until the gesture ends.
  const formatBarNote = noteEdit ? noteEdit.draft : !gestureActive && active ? selectedNote : undefined
  // While typing, the note is re-fitted to its text every render (top edge fixed, as the editor
  // grows) so the bar keeps clear of the editor as lines are added.
  const formatBarBox = formatBarNote
    ? noteScreenGeometry(noteEdit ? fitNoteHeight(formatBarNote) : formatBarNote, view).box
    : null

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
      if (payload.kind === 'note') {
        placeNote(payload.preset ?? 'text', pos)
        return
      }
      addBlock({
        label: payload.label,
        shape: payload.shape,
        color: payload.color,
        x: pos.x,
        y: pos.y,
        width: payload.defaultWidth ?? undefined,
        height: payload.defaultHeight ?? undefined,
        labelColor: payload.labelColor ?? null
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addBlock, stageRef, imageSize, startNewNote]
  )

  function handleStageContextMenu(e: Konva.KonvaEventObject<PointerEvent>): void {
    e.evt.preventDefault()
    const pos = toCanvasCoords(e.evt.clientX, e.evt.clientY)
    if (!pos) return
    selectBlock(null)
    setCanvasMenu({ x: e.evt.clientX, y: e.evt.clientY, canvasX: pos.x, canvasY: pos.y })
  }

  // While dragging one block of a larger selection, mirror the same delta onto the other
  // selected blocks' Konva nodes directly (bypassing React/the store) so they visually move in
  // lockstep instead of snapping into place only once the drag ends and moveBlocksBy commits.
  // `block.x/y` is each block's pre-drag position — untouched in the store until dragend, so it's
  // a stable base for the delta throughout the whole gesture. Followers are intentionally
  // unclamped (matching moveBlocksBy's own accepted simplification for group moves) — only the
  // actively dragged node is clamped, via its dragBoundFunc.
  function handleBlockDragMove(block: { id: number | string; x: number; y: number }, x: number, y: number): void {
    if (selectedBlockIds.size <= 1 || !selectedBlockIds.has(block.id)) return
    const dx = x - block.x
    const dy = y - block.y
    selectedBlockIds.forEach((id) => {
      if (id === block.id) return
      const node = nodeRefs.current.get(id)
      const other = blocks.find((b) => b.id === id)
      if (node && other) node.position({ x: other.x + dx, y: other.y + dy })
    })
    stageRef.current?.batchDraw()
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
    if (drawing) return
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
    // A trackpad pinch arrives as a wheel event with ctrlKey set (Chromium's convention), carrying a
    // small delta per frame — zoom in proportion to it, so the plan follows the fingers smoothly.
    // An ordinary scroll keeps its fixed step per wheel tick.
    const pinch = e.evt.ctrlKey
    if (pinch && Date.now() < zoomDetentUntilRef.current) return
    // Clamped because Ctrl+scroll on a mouse arrives down the same path with a far larger delta per
    // tick, which unclamped would jump the zoom 60% at a time.
    const pinchDelta = Math.max(-25, Math.min(25, e.evt.deltaY))
    const factor = pinch ? Math.exp(-pinchDelta * 0.01) : e.evt.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    let newZoomScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomScale * factor))
    if (pinch) {
      // Detents: a pinch that crosses 100% stops on it for a moment, and one that reaches either
      // limit taps once — each felt on the trackpad the fingers are already on.
      const crossedFit = (zoomScale < 1 && newZoomScale >= 1) || (zoomScale > 1 && newZoomScale <= 1)
      if (crossedFit) {
        newZoomScale = 1
        zoomDetentUntilRef.current = Date.now() + ZOOM_DETENT_HOLD_MS
        haptic('levelChange')
      } else if (
        (newZoomScale === MIN_ZOOM && zoomScale > MIN_ZOOM) ||
        (newZoomScale === MAX_ZOOM && zoomScale < MAX_ZOOM)
      ) {
        haptic('levelChange')
      }
    }
    const newFinalScale = fitScale * newZoomScale
    setZoomPan(newZoomScale, cursorX - contentX * newFinalScale - offsetX, cursorY - contentY * newFinalScale - offsetY)
  }

  return (
    <div
      ref={containerRef}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      {...markup.handlers}
      // In markup mode the right button erases, so it mustn't also open a menu. Mid-erase the
      // pointer is captured, so the event arrives on this container rather than the canvas; a menu
      // left to open there would swallow the release and leave the eraser stuck down.
      onContextMenuCapture={(e) => {
        if (!(active && markupOn)) return
        if (!(e.target instanceof HTMLCanvasElement) && e.target !== e.currentTarget) return
        e.preventDefault()
        e.stopPropagation()
      }}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--color-bg)',
        position: 'relative',
        cursor: drawing ? 'crosshair' : undefined,
        // A pen or finger drag draws; without this the browser may treat it as a scroll.
        touchAction: drawing ? 'none' : undefined
      }}
    >
      {/* The zoom controls and the markup toolbar share one row across the top. The zoom controls come
          first because the row runs right to left (see .layout-canvas-topbar): they keep the corner,
          and the toolbar drops below them when the canvas is too narrow for both. */}
      <div className="layout-canvas-topbar">
        <div className="layout-canvas-zoom">
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
          <button
            className={markupOn ? 'btn small primary inline-icon-text' : 'btn small inline-icon-text'}
            aria-pressed={markupOn}
            onClick={() => setMarkupOn(!markupOn)}
            title="Draw on the layout with a pen, mouse or trackpad"
            style={{ marginLeft: 4, gap: 4 }}
          >
            <PenLine size={13} aria-hidden="true" />
            Markup
          </button>
          {(hasMarks || markupOn) && (
            <button
              className="btn small"
              aria-label={markupHidden ? 'Show markup' : 'Hide markup'}
              aria-pressed={!markupHidden}
              title={markupHidden ? 'Show markup (it prints only while shown)' : 'Hide markup — hidden marks are left off exports too'}
              onClick={() => setMarkupHidden(!markupHidden)}
            >
              {markupHidden ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
            </button>
          )}
          <button className="btn small" onClick={resetView} style={{ marginLeft: 4 }}>
            Reset view
          </button>
          <label
            className="inline-icon-text layout-snap-toggle"
            title="Line blocks up with each other as you drag them. Hold ⌘ while dragging to skip it once."
          >
            <input type="checkbox" checked={snapEnabled} onChange={(e) => void setSnapEnabled(e.target.checked)} />
            Snap
          </label>
        </div>
        {markupOn && active && (
          <MarkupToolbar
            tool={markupTool}
            color={markupColor}
            size={markupSize}
            onTool={(tool) => setMarkupPrefs({ tool })}
            onColor={(color) => setMarkupPrefs({ color })}
            onSize={(size) => setMarkupPrefs({ size })}
            onDone={() => setMarkupOn(false)}
          />
        )}
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
        {markupOn && active
          ? markupTool === 'select'
            ? 'Select marks to move, resize or delete them · Right-drag to erase · Esc when done'
            : markupTool === 'eraser'
              ? 'Drag over marks to rub them out · ⌘Z undoes a pass · Esc when done'
              : 'Drawing · Right-drag or flip the pen to erase · Shift for straight lines · ⌘Z undoes a stroke · Esc when done'
          : noteEdit
          ? 'Esc or click away to finish'
          : gestureActive && snapTargetsRef.current
            ? 'Hold ⌘ to move freely'
          : selectedBlockIds.size >= 2
            ? `${selectedBlockIds.size} selected — drag or resize together`
            : selectedNote
              ? 'Double-click or press Enter to edit text'
              : 'Scroll to zoom · Space-drag to pan · Drag to select'}
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
          <LayoutBackground
            studioId={studioId}
            setupId={setupId}
            onSize={(width, height) => setImageSize({ width, height })}
          />
        </Layer>
        <Layer listening={!drawing}>
          {blocks.map((block) => {
            const shared = {
              ref: (node: Konva.Group | null) => {
                if (node) nodeRefs.current.set(block.id, node)
                else nodeRefs.current.delete(block.id)
              },
              block,
              selected: selectedBlockIds.has(block.id),
              imageSize,
              onSelect: (additive: boolean) => (additive ? toggleBlock(block.id) : selectBlock(block.id)),
              onDragStart: () => {
                beginGesture()
                startSnap(block.id)
              },
              onDragMove: (x: number, y: number) => handleBlockDragMove(block, x, y),
              onDragEnd: (x: number, y: number) => {
                // finally: a throw in the handler must not leave the gate latched — see
                // layoutStore's gestureStartedAt.
                try {
                  handleBlockDragEnd(block, x, y)
                } finally {
                  endSnap()
                  endGesture()
                }
              },
              snap: (center: { x: number; y: number }) => snapDrag(block.id, center),
              onContextMenu: (clientX: number, clientY: number) =>
                setBlockMenu({ blockId: block.id, x: clientX, y: clientY })
            }
            if (block.kind === 'mark') {
              return markupHidden ? null : <LayoutMark key={block.id} {...shared} interactive={!drawing} />
            }
            return block.kind === 'note' ? (
              <LayoutNote
                key={block.id}
                {...shared}
                editing={noteEdit?.id === block.id}
                onEdit={() => startNoteEdit(block.id)}
              />
            ) : (
              <LayoutBlockIcon key={block.id} {...shared} />
            )
          })}
          {[...selectedBlockIds]
            .filter((id) => id !== noteEdit?.id && !drawing && !(markupHidden && blocks.find((b) => b.id === id)?.kind === 'mark'))
            .map((id) => (
            <Transformer
              key={id}
              ref={(node) => {
                if (node) transformerRefs.current.set(id, node)
                else transformerRefs.current.delete(id)
              }}
              rotateEnabled
              // Bigger than Konva's default (10) — blocks are small (many start at 44x44) and,
              // once multi-selected, sit close enough together that the default hit area made it
              // easy to miss a handle and grab the neighboring block's body instead, turning an
              // intended resize into an accidental single-select + move.
              anchorSize={16}
              // Each block already draws its own outline (LayoutBlockIcon's blue stroke) — the
              // Transformer here only supplies the resize/rotate anchors, not a second border.
              borderEnabled={false}
              flipEnabled={false}
              rotationSnaps={ROTATION_SNAPS}
              rotationSnapTolerance={ROTATION_SNAP_TOLERANCE}
              // A note is only ever made wider or narrower — its height follows its text.
              enabledAnchors={
                noteIds.has(id)
                  ? ['middle-left', 'middle-right']
                  : ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right']
              }
              boundBoxFunc={(oldBox, newBox) => boundTransformBox(id, oldBox, newBox)}
              onTransformStart={() => {
                grabbedAnchorRef.current = transformerRefs.current.get(id)?.getActiveAnchor() ?? null
                // Starting from a snap angle (every new block sits at 0°) is not a snap in itself —
                // without this, the first tick of every rotation tapped.
                lastRotationSnapRef.current = rotationSnapAt(nodeRefs.current.get(id)?.rotation() ?? 0)
                beginGesture()
              }}
              onTransform={() => handleTransform(id)}
              onTransformEnd={() => {
                try {
                  handleTransformEnd(id)
                } finally {
                  grabbedAnchorRef.current = null
                  endGesture()
                }
              }}
            />
          ))}
          {snapGuides.map((g, i) => (
            <Line
              key={i}
              points={g.axis === 'x' ? [g.pos, g.from, g.pos, g.to] : [g.from, g.pos, g.to, g.pos]}
              stroke={SNAP_GUIDE_COLOR}
              strokeWidth={1 / finalScale}
              listening={false}
            />
          ))}
          {marquee && (
            <Rect
              x={Math.min(marquee.startX, marquee.x)}
              y={Math.min(marquee.startY, marquee.y)}
              width={Math.abs(marquee.x - marquee.startX)}
              height={Math.abs(marquee.y - marquee.startY)}
              // Was a hardcoded steel blue belonging to neither theme — at 0.2 alpha it was
              // barely perceptible over the light page, and the stroke measured 3.5:1.
              fill={marqueeFill}
              stroke={accent}
              strokeWidth={1 / finalScale}
              listening={false}
            />
          )}
        </Layer>
        {/* The stroke being drawn and the eraser's live results — see useMarkupDrawing. */}
        <Layer listening={false}>
          <Shape ref={previewRef} sceneFunc={(ctx) => markup.drawPreview(ctx)} />
        </Layer>
      </Stage>
      {noteEdit && (
        <NoteEditor
          key={String(noteEdit.draft.id)}
          draft={noteEdit.draft}
          view={view}
          onChange={setNoteEditText}
          onCommit={commitNoteEdit}
          barRef={formatBarRef}
        />
      )}
      {formatBarNote && (
        <NoteFormatBar
          ref={formatBarRef}
          note={formatBarNote}
          box={formatBarBox!}
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
          editing={!!noteEdit}
          onPatch={(patch) => (noteEdit ? patchNoteEdit(patch) : updateBlock(formatBarNote.id, patch))}
          onEdit={() => startNoteEdit(formatBarNote.id)}
          onDone={commitNoteEdit}
        />
      )}
      {blockMenu && (
        <ContextMenu
          x={blockMenu.x}
          y={blockMenu.y}
          items={[
            blocks.find((b) => b.id === blockMenu.blockId)?.kind === 'note'
              ? { label: 'Edit text', onClick: () => startNoteEdit(blockMenu.blockId) }
              : { label: 'Edit', onClick: () => setEditingBlockId(blockMenu.blockId) },
            // Right-clicking a block always leaves it selected (see LayoutBlockIcon's
            // handleContextMenu), so selectedBlockIds already reflects the intended target —
            // mirrors the cmd+d "duplicate-selection" keybind exactly.
            { label: 'Duplicate', onClick: () => duplicateBlocks([...selectedBlockIds]) },
            {
              label: 'Delete',
              onClick: () =>
                removeBlocks(
                  selectedBlockIds.size > 1 && selectedBlockIds.has(blockMenu.blockId)
                    ? [...selectedBlockIds]
                    : [blockMenu.blockId]
                )
            }
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
            },
            {
              label: 'Add text here',
              // The note starts where you clicked, as text does in a drawing app — the click is its
              // top-left corner, not its center.
              onClick: () =>
                placeNote('text', { x: canvasMenu.canvasX + NOTE_DEFAULT_WIDTH / 2, y: canvasMenu.canvasY + NOTE_DEFAULT_HEIGHT / 2 })
            }
          ]}
          onClose={() => setCanvasMenu(null)}
        />
      )}
      {editingBlock && (
        <CustomBlockModal
          initialTitle={editingBlock.label}
          initialColor={editingBlock.color}
          initialPersonName={editingBlock.personName}
          initialLabelColor={editingBlock.labelColor}
          heading="Edit block"
          description={null}
          confirmLabel="Save"
          onClose={() => setEditingBlockId(null)}
          onConfirm={(title, color, personName, labelColor) =>
            updateBlock(editingBlock.id, { label: title, color, personName, labelColor })
          }
        />
      )}
      {addInstrumentAt && (
        <CustomBlockModal
          onClose={() => setAddInstrumentAt(null)}
          onConfirm={(title, color, personName, labelColor) =>
            addBlock({ label: title, shape: 'rect', color, x: addInstrumentAt.x, y: addInstrumentAt.y, personName, labelColor })
          }
        />
      )}
    </div>
  )
}
