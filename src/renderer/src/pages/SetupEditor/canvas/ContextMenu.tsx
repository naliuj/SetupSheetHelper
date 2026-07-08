import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  label: string
  onClick: () => void
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

const MENU_WIDTH = 160
const ROW_HEIGHT = 34

/** Generic right-click menu — shared by block actions (Rename/Delete) and empty-canvas
 *  actions (Add Instrument), positioned at the click. */
export default function ContextMenu({ x, y, items, onClose }: Props): JSX.Element {
  useEffect(() => {
    function handleMouseDown(): void {
      onClose()
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8)
  const top = Math.min(y, window.innerHeight - items.length * ROW_HEIGHT - 16)

  return createPortal(
    <div
      className="picker-menu"
      style={{ position: 'fixed', top, left, width: MENU_WIDTH }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="picker-menu-row"
          onClick={() => {
            item.onClick()
            onClose()
          }}
        >
          {item.label}
        </div>
      ))}
    </div>,
    document.body
  )
}
