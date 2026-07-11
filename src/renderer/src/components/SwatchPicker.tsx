import { useEffect, useRef, useState } from 'react'
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

  function toggle(): void {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left })
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
