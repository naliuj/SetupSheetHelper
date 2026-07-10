import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  x: number
  y: number
  initialColor: string
  onChange: (color: string) => void
  onClose: () => void
}

/** A single native color-picker input, positioned at the context-menu click and opened
 *  immediately via a programmatic click — choosing "Change Color" should feel like one action,
 *  not two, so no extra swatch/confirm UI is needed beyond the OS picker itself. */
export default function ChangeColorPopover({ x, y, initialColor, onChange, onClose }: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.click()
  }, [])

  return createPortal(
    <input
      ref={inputRef}
      type="color"
      defaultValue={initialColor}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onClose}
      style={{ position: 'fixed', top: y, left: x, opacity: 0, width: 1, height: 1 }}
    />,
    document.body
  )
}
