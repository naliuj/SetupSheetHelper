import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import SwatchGrid from './SwatchGrid'

interface Props {
  value: string | null
  onChange: (color: string | null) => void
  allowNone?: boolean
  /** Extra class on the trigger button (e.g. `palette-color` to match the old swatch sizing). */
  className?: string
  title?: string
}

/** Drop-in replacement for a native `<input type="color">`: a small swatch trigger that opens the
 *  fixed-palette grid in a floating popover. Value is a hex string (or null when a color is
 *  optional and "No color" is chosen). */
/** Gap between the trigger and the popover, and the minimum breathing room kept against a window
 *  edge before the popover is pulled back inside. */
const GAP = 4
const EDGE = 8

export default function SwatchPicker({ value, onChange, allowNone, className, title }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent): void {
      const t = e.target as Node
      if (popoverRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // The grid is far wider than its trigger, and the trigger is usually the last control in a row,
  // so left-aligning it under the trigger ran the swatches off the right edge of the window (the
  // Layout Palette's "+ Add block" row is the worst case). Measure the popover once it is up and
  // pull it back inside, flipping above the trigger when there is no room below. useLayoutEffect
  // so the correction lands before paint rather than as a visible jump.
  useLayoutEffect(() => {
    if (!open) return
    const menu = popoverRef.current?.getBoundingClientRect()
    const anchor = triggerRef.current?.getBoundingClientRect()
    if (!menu || !anchor) return

    const left = Math.max(EDGE, Math.min(anchor.left, window.innerWidth - menu.width - EDGE))

    let top = anchor.bottom + GAP
    if (top + menu.height > window.innerHeight - EDGE) {
      const above = anchor.top - menu.height - GAP
      top = above >= EDGE ? above : Math.max(EDGE, window.innerHeight - menu.height - EDGE)
    }

    setPos({ top, left })
  }, [open])

  function toggle(): void {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + GAP, left: rect.left })
    setOpen((v) => !v)
  }

  function handleSelect(color: string | null): void {
    onChange(color)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        onClick={toggle}
        title={title ?? 'Choose color'}
        aria-label={title ?? 'Choose color'}
        style={
          className
            ? { background: value ?? 'transparent' }
            : {
                width: 26,
                height: 26,
                padding: 0,
                borderRadius: 'var(--radius)',
                border: '1px solid var(--color-border)',
                background: value ?? 'transparent',
                cursor: 'pointer'
              }
        }
      >
        {!value && <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>—</span>}
      </button>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="picker-menu"
            style={{ position: 'fixed', top: pos.top, left: pos.left, padding: 8 }}
          >
            <SwatchGrid value={value} onSelect={handleSelect} allowNone={allowNone} />
          </div>,
          document.body
        )}
    </>
  )
}
