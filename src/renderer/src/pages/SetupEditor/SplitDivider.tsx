import { useEffect, useRef, useState } from 'react'

const MIN_RATIO = 0.2
const MAX_RATIO = 0.8

interface Props {
  onRatioChange: (ratio: number) => void
  /** Fired once, on mouseup — the caller debounces the persisted write on every onRatioChange but
   *  wants it flushed immediately once dragging actually stops, mirroring windowBounds.ts's
   *  persist-now-on-close on top of its own debounced resize/move writes. */
  onDragEnd: () => void
}

/** A thin draggable bar between two flex-basis panes. No existing split-pane utility in the
 *  codebase to reuse — this is a small, self-contained drag-to-resize control: computes the new
 *  ratio from the container's own bounding rect (captured once, at drag start) and the pointer's
 *  clientX, clamped so neither pane can be squeezed away entirely. Purely presentational/input —
 *  it doesn't own the ratio itself, that's SplitSetupView's state (and what gets persisted). */
export default function SplitDivider({ onRatioChange, onDragEnd }: Props): JSX.Element {
  const containerRectRef = useRef<DOMRect | null>(null)
  const [dragging, setDragging] = useState(false)

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>): void {
    const container = e.currentTarget.parentElement
    if (!container) return
    containerRectRef.current = container.getBoundingClientRect()
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return
    function handleMouseMove(e: MouseEvent): void {
      const rect = containerRectRef.current
      if (!rect || rect.width === 0) return
      const next = (e.clientX - rect.left) / rect.width
      onRatioChange(Math.max(MIN_RATIO, Math.min(MAX_RATIO, next)))
    }
    function handleMouseUp(): void {
      setDragging(false)
      onDragEnd()
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, onRatioChange, onDragEnd])

  return (
    <div
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize split view"
      style={{
        width: 6,
        flexShrink: 0,
        cursor: 'col-resize',
        background: dragging ? 'var(--color-accent)' : 'var(--color-border)'
      }}
    />
  )
}
