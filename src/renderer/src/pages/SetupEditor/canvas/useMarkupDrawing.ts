import { useRef } from 'react'
import type Konva from 'konva'
import type { MarkData, MarkTool, RoomLayoutBlockDraft } from '@shared/types/setup'
import type { NewMarkInput } from '@renderer/state/layoutStore'
import type { MarkupTool } from '@renderer/state/markupPrefsStore'
import {
  eraseMark,
  HIGHLIGHTER_OPACITY,
  inkOutline,
  makeMark,
  markFromRun,
  strokeWidth,
  traceOutline,
  type NewMark
} from './markGeometry'

/** The eraser's radius on screen, in CSS pixels — converted to room pixels at the current zoom, so
 *  it feels the same size however far in you are. */
const ERASER_RADIUS_PX = 10

/** A mark-shaped object the eraser can work on: an original block, or a piece a pass has already
 *  left of one. */
type ErasableMark = Pick<RoomLayoutBlockDraft, 'id' | 'x' | 'y' | 'width' | 'height' | 'rotation' | 'markData'>

interface Stroke {
  pointerId: number
  tool: MarkTool
  /** Room points: [x, y, pressure, …] for ink, the start and current point for everything else. */
  points: number[]
}

interface ErasePass {
  pointerId: number
  /** Every original mark the pass has touched → what's left of it so far (empty = all gone). */
  pieces: Map<number | string, ErasableMark[]>
  /** Where the eraser last was, for filling in the gap to the next sample. */
  last: [number, number] | null
  cursor: [number, number] | null
}

interface Options {
  tool: MarkupTool
  color: string
  size: number
  /** Whether a drawing tool is active at all (markup on, and not the select tool). */
  drawing: boolean
  /** Whether markup mode is on, whatever the tool: a right-button drag erases in any of them. */
  markupOn: boolean
  blocks: RoomLayoutBlockDraft[]
  finalScale: number
  toCanvasCoords: (clientX: number, clientY: number) => { x: number; y: number } | null
  nodeRefs: React.MutableRefObject<Map<number | string, Konva.Group>>
  previewRef: React.MutableRefObject<Konva.Shape | null>
  addMark: (mark: NewMarkInput) => void
  applyErase: (removeIds: (number | string)[], add: NewMarkInput[]) => void
  beginGesture: () => void
  endGesture: () => void
}

/** Pointer handling for Layout Mode markup: pen, highlighter, lines, arrows, shapes and the partial
 *  eraser, from a drawing tablet, a mouse or a trackpad.
 *
 *  Native pointer events rather than Konva's, for three things Konva doesn't pass through: pen
 *  pressure, the pen's eraser end, and coalesced events (a tablet reports far more often than the
 *  screen draws; without them a quick stroke comes out as a polygon). The stroke in progress lives
 *  in a ref and is drawn by one preview Shape redrawn with batchDraw — a React render per pointer
 *  sample would lag behind a pen. Each finished stroke, and each whole eraser pass, is one store
 *  change, so one undo step.
 *
 *  The press is taken in the capture phase and kept from Konva, so a stroke — or a right-button
 *  erase with the select tool in hand — never also clicks, drags or marquee-selects what it starts
 *  on. Pointer capture then sends the rest of the gesture to the container, past Konva too. */
export function useMarkupDrawing(o: Options): {
  handlers: {
    onPointerDownCapture: (e: React.PointerEvent<HTMLDivElement>) => void
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void
  }
  drawPreview: (ctx: Konva.Context) => void
} {
  const strokeRef = useRef<Stroke | null>(null)
  const eraseRef = useRef<ErasePass | null>(null)
  const shiftRef = useRef(false)
  // The latest options, read by handlers that outlive a render.
  const opts = useRef(o)
  opts.current = o

  const redraw = (): void => {
    opts.current.previewRef.current?.getLayer()?.batchDraw()
  }
  const eraserRadius = (): number => ERASER_RADIUS_PX / opts.current.finalScale

  /** The pen's eraser end: Chromium reports it as a pen with the eraser button (bit 32 of
   *  `buttons`, button 5). Drivers differ, which is why the toolbar's eraser and the E key exist too. */
  const isEraserEnd = (e: React.PointerEvent): boolean => e.pointerType === 'pen' && ((e.buttons & 32) !== 0 || e.button === 5)

  function samples(e: React.PointerEvent): PointerEvent[] {
    const native = e.nativeEvent
    const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : []
    return coalesced.length > 0 ? coalesced : [native]
  }

  function pressureOf(ev: PointerEvent): number {
    // A mouse or trackpad reports 0.5 while pressed; keep exactly that, so markGeometry knows to
    // shape the ink by speed instead.
    return ev.pointerType === 'pen' ? Math.max(0.05, ev.pressure || 0.5) : 0.5
  }

  /** Shift keeps a line to 45° steps and a shape square. */
  function constrain(tool: MarkTool, x1: number, y1: number, x2: number, y2: number): [number, number] {
    if (!shiftRef.current) return [x2, y2]
    const dx = x2 - x1
    const dy = y2 - y1
    if (tool === 'line' || tool === 'arrow') {
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
      const len = Math.hypot(dx, dy)
      return [x1 + Math.cos(angle) * len, y1 + Math.sin(angle) * len]
    }
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    return [x1 + Math.sign(dx || 1) * side, y1 + Math.sign(dy || 1) * side]
  }

  /** The stroke in progress as a finished mark would store it, or null while it's too small to
   *  keep (a line of a pixel or two, a box with no area). */
  function strokeToMark(stroke: Stroke): NewMark | null {
    const { color, size } = opts.current
    if (stroke.tool === 'pen' || stroke.tool === 'highlighter') return makeMark(stroke.tool, color, size, stroke.points)
    const [x1, y1, rx2, ry2] = stroke.points
    const [x2, y2] = constrain(stroke.tool, x1, y1, rx2, ry2)
    const tooSmall = stroke.tool === 'line' || stroke.tool === 'arrow' ? Math.hypot(x2 - x1, y2 - y1) < 3 : Math.abs(x2 - x1) < 4 || Math.abs(y2 - y1) < 4
    return tooSmall ? null : makeMark(stroke.tool, color, size, [x1, y1, x2, y2])
  }

  // --- Erasing -------------------------------------------------------------------------------------

  /** Runs the eraser from its last position to (x, y), sampled densely enough that a fast sweep
   *  doesn't skip over thin ink between two pointer events. */
  function eraseTo(x: number, y: number): void {
    const pass = eraseRef.current
    if (!pass) return
    const radius = eraserRadius()
    const path: number[] = []
    if (pass.last) {
      const [lx, ly] = pass.last
      const steps = Math.max(1, Math.ceil(Math.hypot(x - lx, y - ly) / (radius / 2)))
      for (let i = 1; i <= steps; i++) path.push(lx + ((x - lx) * i) / steps, ly + ((y - ly) * i) / steps)
    } else {
      path.push(x, y)
    }
    pass.last = [x, y]
    pass.cursor = [x, y]

    for (const block of opts.current.blocks) {
      if (block.kind !== 'mark' || !block.markData) continue
      const current = pass.pieces.get(block.id) ?? [block]
      const next: ErasableMark[] = []
      let changed = false
      for (const piece of current) {
        const result = eraseMark(piece as RoomLayoutBlockDraft, path, radius)
        if (result.kind === 'untouched') {
          next.push(piece)
          continue
        }
        changed = true
        if (result.kind === 'split') {
          for (const run of result.runs) {
            const m = markFromRun(piece as RoomLayoutBlockDraft, run)
            next.push({ id: `${String(block.id)}-piece`, ...m.box, rotation: m.rotation ?? 0, markData: m.markData })
          }
        }
      }
      if (!changed) continue
      if (!pass.pieces.has(block.id)) opts.current.nodeRefs.current.get(block.id)?.visible(false)
      pass.pieces.set(block.id, next)
    }
    redraw()
  }

  function finishErase(commit: boolean): void {
    const pass = eraseRef.current
    eraseRef.current = null
    if (!pass) return
    if (commit && pass.pieces.size > 0) {
      const add: NewMarkInput[] = []
      for (const pieces of pass.pieces.values()) {
        for (const p of pieces) {
          add.push({ box: { x: p.x, y: p.y, width: p.width, height: p.height }, markData: p.markData as MarkData, rotation: p.rotation })
        }
      }
      opts.current.applyErase([...pass.pieces.keys()], add)
    } else {
      // Cancelled: put back what the pass had hidden.
      for (const id of pass.pieces.keys()) opts.current.nodeRefs.current.get(id)?.visible(true)
    }
    redraw()
  }

  // --- Pointer handlers ----------------------------------------------------------------------------

  function onPointerDownCapture(e: React.PointerEvent<HTMLDivElement>): void {
    const { drawing, markupOn, tool, toCanvasCoords, beginGesture } = opts.current
    // The right button (or a pen button mapped to it) erases for as long as it's held, whichever
    // tool is picked.
    const secondary = e.button === 2
    if (!(drawing || (markupOn && secondary))) return
    // Only a press on the canvas itself — not the toolbar, zoom buttons or an editor over it.
    if (!(e.target instanceof HTMLCanvasElement)) return
    if (strokeRef.current || eraseRef.current) return
    const pos = toCanvasCoords(e.clientX, e.clientY)
    if (!pos) return
    // preventDefault also holds back the mousedown the browser would send after this.
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    shiftRef.current = e.shiftKey
    beginGesture()
    if (tool === 'eraser' || secondary || isEraserEnd(e)) {
      eraseRef.current = { pointerId: e.pointerId, pieces: new Map(), last: null, cursor: null }
      eraseTo(pos.x, pos.y)
      return
    }
    const markTool = tool as MarkTool
    const ink = markTool === 'pen' || markTool === 'highlighter'
    strokeRef.current = {
      pointerId: e.pointerId,
      tool: markTool,
      points: ink ? [pos.x, pos.y, pressureOf(e.nativeEvent)] : [pos.x, pos.y, pos.x, pos.y]
    }
    redraw()
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    shiftRef.current = e.shiftKey
    const { toCanvasCoords } = opts.current
    const pass = eraseRef.current
    if (pass && pass.pointerId === e.pointerId) {
      for (const ev of samples(e)) {
        const pos = toCanvasCoords(ev.clientX, ev.clientY)
        if (pos) eraseTo(pos.x, pos.y)
      }
      return
    }
    const stroke = strokeRef.current
    if (!stroke || stroke.pointerId !== e.pointerId) return
    if (stroke.tool === 'pen' || stroke.tool === 'highlighter') {
      for (const ev of samples(e)) {
        const pos = toCanvasCoords(ev.clientX, ev.clientY)
        if (pos) stroke.points.push(pos.x, pos.y, pressureOf(ev))
      }
    } else {
      const pos = toCanvasCoords(e.clientX, e.clientY)
      if (pos) {
        stroke.points[2] = pos.x
        stroke.points[3] = pos.y
      }
    }
    redraw()
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    const { addMark, endGesture } = opts.current
    try {
      if (eraseRef.current?.pointerId === e.pointerId) {
        finishErase(true)
        return
      }
      const stroke = strokeRef.current
      if (!stroke || stroke.pointerId !== e.pointerId) return
      strokeRef.current = null
      const mark = strokeToMark(stroke)
      if (mark) addMark({ box: mark.box, markData: mark.markData })
      redraw()
    } finally {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      endGesture()
    }
  }

  function onPointerCancel(e: React.PointerEvent<HTMLDivElement>): void {
    if (eraseRef.current?.pointerId === e.pointerId) finishErase(false)
    if (strokeRef.current?.pointerId === e.pointerId) strokeRef.current = null
    opts.current.endGesture()
    redraw()
  }

  // --- Preview ---------------------------------------------------------------------------------

  /** Draws a mark (block-shaped: center, size, rotation) onto the preview canvas. */
  function paintMark(c: CanvasRenderingContext2D, m: ErasableMark): void {
    const data = m.markData
    if (!data) return
    c.save()
    c.translate(m.x, m.y)
    c.rotate((m.rotation * Math.PI) / 180)
    c.translate(-m.width / 2, -m.height / 2)
    const width = strokeWidth(data)
    c.fillStyle = data.color
    c.strokeStyle = data.color
    c.lineWidth = width
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.globalAlpha = data.tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1
    c.beginPath()
    if (data.tool === 'pen' || data.tool === 'highlighter') {
      traceOutline(c, inkOutline(data))
      c.fill()
    } else if (data.tool === 'line' || data.tool === 'arrow') {
      const [x1, y1, x2, y2] = data.points
      c.moveTo(x1, y1)
      c.lineTo(x2, y2)
      c.stroke()
      if (data.tool === 'arrow') {
        const angle = Math.atan2(y2 - y1, x2 - x1)
        const head = width * 4
        c.beginPath()
        c.moveTo(x2, y2)
        c.lineTo(x2 - head * Math.cos(angle - 0.4), y2 - head * Math.sin(angle - 0.4))
        c.lineTo(x2 - head * Math.cos(angle + 0.4), y2 - head * Math.sin(angle + 0.4))
        c.closePath()
        c.fill()
      }
    } else if (data.tool === 'rect') {
      c.strokeRect(0, 0, m.width, m.height)
    } else {
      c.ellipse(m.width / 2, m.height / 2, m.width / 2, m.height / 2, 0, 0, Math.PI * 2)
      c.stroke()
    }
    c.restore()
  }

  /** The preview Shape's sceneFunc: the stroke being drawn, the pieces an eraser pass has left so
   *  far (standing in for the originals it hid), and the eraser's outline. Konva's context wraps a
   *  plain 2D canvas context; the native one is used directly for save/rotate/ellipse. */
  function drawPreview(ctx: Konva.Context): void {
    const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
    const stroke = strokeRef.current
    if (stroke) {
      const mark = strokeToMark(stroke)
      if (mark) paintMark(c, { id: 'preview', ...mark.box, rotation: 0, markData: mark.markData })
    }
    const pass = eraseRef.current
    if (pass) {
      for (const pieces of pass.pieces.values()) for (const p of pieces) paintMark(c, p)
      if (pass.cursor) {
        c.save()
        c.beginPath()
        c.arc(pass.cursor[0], pass.cursor[1], eraserRadius(), 0, Math.PI * 2)
        c.lineWidth = 1 / opts.current.finalScale
        c.strokeStyle = '#5c6672'
        c.stroke()
        c.restore()
      }
    }
  }

  return { handlers: { onPointerDownCapture, onPointerMove, onPointerUp, onPointerCancel }, drawPreview }
}
