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

export interface CableDrawOptions {
  from: Pt
  to: Pt
  color: string
  sag: number
  weight: number
  selected?: boolean
  accent?: string
}

function traceCable(ctx: Konva.Context, from: Pt, to: Pt, sag: number): void {
  const control = cableControlPoint(from, to, sag)
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.quadraticCurveTo(control.x, control.y, to.x, to.y)
}

/** Draws one cable by hand: a drooping curve with a plug at each end, a dark outline under the
 *  colored core so every color reads on white paper. A plain function rather than only the
 *  component's sceneFunc, so the export (renderPatchbayImage.ts) draws cables exactly as the
 *  editor does. */
export function drawCable(
  ctx: Konva.Context,
  { from, to, color, sag, weight, selected = false, accent = '#00a1ff' }: CableDrawOptions
): void {
  const outline = darken(color)
  const plug = weight * 1.4
  ctx.setAttr('lineCap', 'round')
  if (selected) {
    traceCable(ctx, from, to, sag)
    ctx.setAttr('strokeStyle', accent)
    ctx.setAttr('globalAlpha', 0.45)
    ctx.setAttr('lineWidth', weight * 2.6)
    ctx.stroke()
    ctx.setAttr('globalAlpha', 1)
  }
  traceCable(ctx, from, to, sag)
  ctx.setAttr('strokeStyle', outline)
  ctx.setAttr('lineWidth', weight * 1.35)
  ctx.stroke()
  traceCable(ctx, from, to, sag)
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
      sceneFunc={(ctx) => drawCable(ctx, { from, to, color, sag, weight, selected, accent })}
      hitFunc={(ctx, shape) => {
        traceCable(ctx, from, to, sag)
        ctx.strokeShape(shape)
      }}
    />
  )
}
