import { useEffect, useRef, useState } from 'react'

interface Options {
  containerRef: React.RefObject<HTMLDivElement | null>
  /** The view's current pan, read when a press starts. */
  getPan: () => { x: number; y: number }
  /** Moves the view to a new pan, keeping the zoom as it is. */
  setPan: (x: number, y: number) => void
  /** Told where the pointer is (client pixels) on every move of a pan. */
  onMove?: (clientX: number, clientY: number) => void
}

/** Middle-button drag to pan a canvas — a fixed pointer convention, like Space-drag, so it works
 *  whatever tool is in hand. The press is taken in the capture phase on the container and kept
 *  from Konva entirely, so it can't start a drag, a marquee or a cable, or change the selection,
 *  and its release is kept from Konva too (a release Konva saw without its press could finish
 *  a click on whatever was pressed last). The rest of the drag is followed on the window, so the
 *  pan carries on when the pointer runs off the canvas. Konva still sees the moves in between,
 *  which keeps hover and anything following the pointer up to date as the view slides under it.
 *  Returns whether a middle-button pan is in progress, for the cursor. */
export function useMiddleButtonPan({ containerRef, getPan, setPan, onMove }: Options): boolean {
  const [panning, setPanning] = useState(false)
  const opts = useRef({ getPan, setPan, onMove })
  opts.current = { getPan, setPan, onMove }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let start: { clientX: number; clientY: number; panX: number; panY: number } | null = null

    const isMiddle = (e: MouseEvent): boolean => e.button === 1
    // Only a press on the canvas itself — not the toolbar, zoom buttons or an editor over it.
    const onCanvas = (e: Event): boolean => e.target instanceof HTMLCanvasElement

    function stop(): void {
      if (!start) return
      start = null
      setPanning(false)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('mouseup', swallow, true)
      window.removeEventListener('blur', stop)
    }

    function onMove(e: PointerEvent): void {
      if (!start) return
      // The middle button is up, so its release went somewhere this never heard about.
      if ((e.buttons & 4) === 0) {
        stop()
        return
      }
      opts.current.onMove?.(e.clientX, e.clientY)
      opts.current.setPan(start.panX + e.clientX - start.clientX, start.panY + e.clientY - start.clientY)
    }

    function onUp(e: PointerEvent): void {
      if (!isMiddle(e)) return
      e.stopPropagation()
      stop()
    }

    // The mouse events Chromium sends alongside the pointer ones: the middle button's are kept
    // from Konva, and preventing the press's default holds back the browser's autoscroll.
    function swallow(e: MouseEvent): void {
      if (!isMiddle(e)) return
      e.preventDefault()
      e.stopPropagation()
    }

    function onPointerDown(e: PointerEvent): void {
      if (!isMiddle(e) || !onCanvas(e)) return
      // Not preventDefault: that would also hold back the mouse moves Konva follows meanwhile.
      // The mousedown that follows is stopped (and its autoscroll prevented) in onMouseDown.
      e.stopPropagation()
      const pan = opts.current.getPan()
      start = { clientX: e.clientX, clientY: e.clientY, panX: pan.x, panY: pan.y }
      setPanning(true)
      window.addEventListener('pointermove', onMove, true)
      window.addEventListener('pointerup', onUp, true)
      window.addEventListener('mouseup', swallow, true)
      window.addEventListener('blur', stop)
    }

    function onMouseDown(e: MouseEvent): void {
      if (onCanvas(e)) swallow(e)
    }

    function onAuxClick(e: MouseEvent): void {
      if (onCanvas(e)) swallow(e)
    }

    el.addEventListener('pointerdown', onPointerDown, true)
    el.addEventListener('mousedown', onMouseDown, true)
    el.addEventListener('auxclick', onAuxClick, true)
    return () => {
      stop()
      el.removeEventListener('pointerdown', onPointerDown, true)
      el.removeEventListener('mousedown', onMouseDown, true)
      el.removeEventListener('auxclick', onAuxClick, true)
    }
  }, [containerRef])

  return panning
}
