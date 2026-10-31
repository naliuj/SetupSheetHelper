import { Shape } from 'react-konva'
import type Konva from 'konva'
import { cableControlPoint, darken, type Pt } from './cableGeometry'

interface Props {
  from: Pt
  to: Pt
  color: string
  sag: number
  /** Plug size and cable weight scale with the drawing's jack spacing. */
  weight: number
  selected?: boolean
  accent?: string
  /** A cable still being drawn: no hit area, slightly see-through. */
  preview?: boolean
  name?: string
  onMouseDown?: (e: Konva.KonvaEventObject<MouseEvent>) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

/** One patch cable: a drooping curve with a plug at each end, drawn with a dark outline so every
 *  color reads on white paper. */
export default function PatchbayCable({
  from,
  to,
  color,
  sag,
  weight,
  selected = false,
  accent = '#00a1ff',
  preview = false,
  name = 'cable',
  onMouseDown,
  onMouseEnter,
  onMouseLeave
}: Props): JSX.Element {
  const control = cableControlPoint(from, to, sag)
  const outline = darken(color)
  const plug = weight * 1.4

  function trace(ctx: Konva.Context): void {
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.quadraticCurveTo(control.x, control.y, to.x, to.y)
  }

  return (
    <Shape
      name={name}
      listening={!preview}
      opacity={preview ? 0.75 : 1}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      // Not drawn with these (sceneFunc strokes by hand); they give the hit canvas a stroke to
      // trace, so the whole cable is grabbable rather than nothing at all.
      stroke={color}
      strokeWidth={weight}
      hitStrokeWidth={Math.max(weight * 3, 12)}
      sceneFunc={(ctx) => {
        ctx.setAttr('lineCap', 'round')
        if (selected) {
          trace(ctx)
          ctx.setAttr('strokeStyle', accent)
          ctx.setAttr('globalAlpha', 0.45)
          ctx.setAttr('lineWidth', weight * 2.6)
          ctx.stroke()
          ctx.setAttr('globalAlpha', 1)
        }
        trace(ctx)
        ctx.setAttr('strokeStyle', outline)
        ctx.setAttr('lineWidth', weight * 1.35)
        ctx.stroke()
        trace(ctx)
        ctx.setAttr('strokeStyle', color)
        ctx.setAttr('lineWidth', weight)
        ctx.stroke()
        for (const end of [from, to]) {
          ctx.beginPath()
          ctx.arc(end.x, end.y, plug, 0, Math.PI * 2)
          ctx.setAttr('fillStyle', color)
          ctx.fill()
          ctx.setAttr('strokeStyle', outline)
          ctx.setAttr('lineWidth', weight * 0.45)
          ctx.stroke()
        }
      }}
      hitFunc={(ctx, shape) => {
        trace(ctx)
        ctx.strokeShape(shape)
      }}
    />
  )
}
