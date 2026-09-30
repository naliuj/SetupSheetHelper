import { forwardRef, useRef } from 'react'
import {
  Circle,
  Eraser,
  GripHorizontal,
  GripVertical,
  Highlighter,
  Minus,
  MousePointer2,
  MoveUpRight,
  PanelLeft,
  PanelTop,
  PenLine,
  Square
} from 'lucide-react'
import type { MarkupTool, MarkupToolbarOrientation } from '@renderer/state/markupPrefsStore'
import { useKeybindPrefsStore } from '@renderer/state/keybindPrefsStore'
import { formatCombo, markupToolActionId } from '@shared/constants/keybindActions'
import { MARK_COLORS, MARK_SIZES } from './markGeometry'

interface Props {
  tool: MarkupTool
  color: string
  size: number
  onTool: (tool: MarkupTool) => void
  onColor: (color: string) => void
  onSize: (size: number) => void
  onDone: () => void
  orientation: MarkupToolbarOrientation
  onOrientation: (orientation: MarkupToolbarOrientation) => void
  /** The grip being dragged: the pointer's travel since it was pressed, in CSS pixels. */
  onGripDrag: (phase: 'start' | 'move' | 'end', dx: number, dy: number) => void
  /** Arrow keys on the grip: move by this much. */
  onGripNudge: (dx: number, dy: number) => void
  /** Double-click (or Enter) on the grip: back to the top row. */
  onDock: () => void
  /** Set while the toolbar floats somewhere the user moved it. */
  style?: React.CSSProperties
}

/** The tool buttons. Each tool's key is a keybind (Settings → Keybinds → Markup), shown in its
 *  tooltip. */
const MARKUP_TOOLS: { tool: MarkupTool; label: string; Icon: typeof PenLine }[] = [
  { tool: 'select', label: 'Select and move', Icon: MousePointer2 },
  { tool: 'pen', label: 'Pen', Icon: PenLine },
  { tool: 'highlighter', label: 'Highlighter', Icon: Highlighter },
  { tool: 'line', label: 'Line', Icon: Minus },
  { tool: 'arrow', label: 'Arrow', Icon: MoveUpRight },
  { tool: 'ellipse', label: 'Ellipse', Icon: Circle },
  { tool: 'rect', label: 'Box', Icon: Square },
  { tool: 'eraser', label: 'Eraser', Icon: Eraser }
]

const SIZE_NAMES = ['Thin', 'Medium', 'Thick']

/** The floating markup toolbar over the Layout Mode canvas: a grip to move it, tools, colors,
 *  sizes, a horizontal/vertical switch and Done. Every control is a real button with a name, and
 *  mousedown is swallowed so clicking one never starts a stroke on the canvas underneath. Where it
 *  sits is LayoutStage's business; this only reports the grip's movement. */
const MarkupToolbar = forwardRef<HTMLDivElement, Props>(function MarkupToolbar(
  { tool, color, size, onTool, onColor, onSize, onDone, orientation, onOrientation, onGripDrag, onGripNudge, onDock, style },
  ref
) {
  // Subscribed so a rebinding shows in the tooltips straight away.
  useKeybindPrefsStore((s) => s.overrides)
  const resolve = useKeybindPrefsStore((s) => s.resolve)
  const gripStart = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const vertical = orientation === 'vertical'
  const Grip = vertical ? GripHorizontal : GripVertical

  function handleGripKeyDown(e: React.KeyboardEvent): void {
    const step = e.shiftKey ? 50 : 10
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step]
    }
    if (moves[e.key]) {
      e.preventDefault()
      onGripNudge(...moves[e.key])
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onDock()
    }
  }

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Markup"
      aria-orientation={orientation}
      className={vertical ? 'picker-menu markup-toolbar vertical' : 'picker-menu markup-toolbar'}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="markup-toolbar-grip"
        aria-label="Move toolbar"
        title="Drag to move · double-click to put back"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          gripStart.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY }
          onGripDrag('start', 0, 0)
        }}
        onPointerMove={(e) => {
          const start = gripStart.current
          if (start?.pointerId === e.pointerId) onGripDrag('move', e.clientX - start.x, e.clientY - start.y)
        }}
        onPointerUp={(e) => {
          const start = gripStart.current
          if (start?.pointerId !== e.pointerId) return
          gripStart.current = null
          onGripDrag('end', e.clientX - start.x, e.clientY - start.y)
        }}
        onPointerCancel={(e) => {
          const start = gripStart.current
          if (start?.pointerId !== e.pointerId) return
          gripStart.current = null
          onGripDrag('end', 0, 0)
        }}
        onDoubleClick={onDock}
        onKeyDown={handleGripKeyDown}
      >
        <Grip size={14} aria-hidden="true" />
      </button>
      {MARKUP_TOOLS.map(({ tool: t, label, Icon }) => {
        const combo = resolve(markupToolActionId(t))
        return (
          <button
            key={t}
            type="button"
            className="markup-toolbar-button"
            aria-label={label}
            aria-pressed={tool === t}
            title={combo ? `${label} (${formatCombo(combo)})` : label}
            onClick={() => onTool(t)}
          >
            <Icon size={16} aria-hidden="true" />
          </button>
        )
      })}
      <span className="markup-toolbar-divider" aria-hidden="true" />
      {MARK_COLORS.map((c) => (
        <button
          key={c.hex}
          type="button"
          className="markup-toolbar-swatch"
          aria-label={c.name}
          aria-pressed={color === c.hex}
          title={c.name}
          style={{ background: c.hex }}
          onClick={() => onColor(c.hex)}
        />
      ))}
      <span className="markup-toolbar-divider" aria-hidden="true" />
      {MARK_SIZES.map((s, i) => (
        <button
          key={s}
          type="button"
          className="markup-toolbar-button"
          aria-label={`${SIZE_NAMES[i]} line`}
          aria-pressed={size === s}
          title={`${SIZE_NAMES[i]} line`}
          onClick={() => onSize(s)}
        >
          <span className="markup-toolbar-dot" style={{ width: 3 + i * 4, height: 3 + i * 4 }} aria-hidden="true" />
        </button>
      ))}
      <span className="markup-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        className="markup-toolbar-button"
        aria-label={vertical ? 'Horizontal toolbar' : 'Vertical toolbar'}
        title={vertical ? 'Horizontal toolbar' : 'Vertical toolbar'}
        onClick={() => onOrientation(vertical ? 'horizontal' : 'vertical')}
      >
        {vertical ? <PanelTop size={16} aria-hidden="true" /> : <PanelLeft size={16} aria-hidden="true" />}
      </button>
      <button type="button" className="btn small primary" onClick={onDone}>
        Done
      </button>
    </div>
  )
})

export default MarkupToolbar
