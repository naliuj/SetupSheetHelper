import { Circle, Eraser, Highlighter, Minus, MousePointer2, MoveUpRight, PenLine, Square } from 'lucide-react'
import type { MarkupTool } from '@renderer/state/markupPrefsStore'
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

/** The floating markup toolbar over the Layout Mode canvas: tools, colors, sizes and Done. Every
 *  control is a real button with a name, and mousedown is swallowed so clicking one never starts
 *  a stroke on the canvas underneath. */
export default function MarkupToolbar({ tool, color, size, onTool, onColor, onSize, onDone }: Props): JSX.Element {
  // Subscribed so a rebinding shows in the tooltips straight away.
  useKeybindPrefsStore((s) => s.overrides)
  const resolve = useKeybindPrefsStore((s) => s.resolve)
  return (
    <div
      role="toolbar"
      aria-label="Markup"
      className="picker-menu markup-toolbar"
      onPointerDown={(e) => e.stopPropagation()}
    >
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
      <button type="button" className="btn small primary" onClick={onDone}>
        Done
      </button>
    </div>
  )
}
