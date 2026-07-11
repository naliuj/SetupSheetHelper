import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import SwatchGrid from '@renderer/components/SwatchGrid'

interface Props {
  x: number
  y: number
  initialColor: string
  onChange: (color: string) => void
  onClose: () => void
}

/** The fixed-palette swatch grid shown at the context-menu click point, for recoloring a layout
 *  block. Closes on outside click / Escape; picking a swatch applies it and closes. */
export default function ChangeColorPopover({ x, y, initialColor, onChange, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent): void {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div ref={ref} className="picker-menu" style={{ position: 'fixed', top: y, left: x, padding: 8 }}>
      <SwatchGrid
        value={initialColor}
        onSelect={(color) => {
          if (color) onChange(color)
          onClose()
        }}
      />
    </div>,
    document.body
  )
}
