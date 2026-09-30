import { Circle, Eraser, Highlighter, Minus, MousePointer2, MoveUpRight, PenLine, Square } from 'lucide-react'
import type { MarkupTool } from '@renderer/state/markupPrefsStore'
import { MARK_COLORS, MARK_SIZES } from './markGeometry'

interface Props {
  tool: MarkupTool
  color: string
  size: number
  onTool: (tool: MarkupTool) => void
  onColor: (color: string) => void
  onSize: (size: number) => void
  onDone: () => void
}

/** The tool buttons, each with the single key that picks it while markup is on (see LayoutStage). */
export const MARKUP_TOOLS: { tool: MarkupTool; label: string; key: string; Icon: typeof PenLine }[] = [
  { tool: 'select', label: 'Select and move', key: 'V', Icon: MousePointer2 },
  { tool: 'pen', label: 'Pen', key: 'P', Icon: PenLine },
  { tool: 'highlighter', label: 'Highlighter', key: 'H', Icon: Highlighter },
  { tool: 'line', label: 'Line', key: 'L', Icon: Minus },
  { tool: 'arrow', label: 'Arrow', key: 'A', Icon: MoveUpRight },
  { tool: 'ellipse', label: 'Ellipse', key: 'O', Icon: Circle },
  { tool: 'rect', label: 'Box', key: 'R', Icon: Square },
  { tool: 'eraser', label: 'Eraser', key: 'E', Icon: Eraser }
]

const SIZE_NAMES = ['Thin', 'Medium', 'Thick']

/** The floating markup toolbar over the Layout Mode canvas: tools, colors, sizes and Done. Every
 *  control is a real button with a name, and mousedown is swallowed so clicking one never starts
 *  a stroke on the canvas underneath. */
export default function MarkupToolbar({ tool, color, size, onTool, onColor, onSize, onDone }: Props): JSX.Element {
  return (
    <div
      role="toolbar"
      aria-label="Markup"
      className="picker-menu markup-toolbar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {MARKUP_TOOLS.map(({ tool: t, label, key, Icon }) => (
        <button
          key={t}
          type="button"
          className="markup-toolbar-button"
          aria-label={label}
          aria-pressed={tool === t}
          title={`${label} (${key})`}
          onClick={() => onTool(t)}
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
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
      <button type="button" className="btn small primary" onClick={onDone}>
        Done
      </button>
    </div>
  )
}
