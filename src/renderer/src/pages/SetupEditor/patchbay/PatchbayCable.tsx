import { Shape } from 'react-konva'
import type Konva from 'konva'
import { cableControlPoint, cableEnds, darken, type PlugStyle, type Pt } from './cableGeometry'

interface Props {
  from: Pt
  to: Pt
  color: string
  sag: number
  /** Plug size and cable weight scale with the drawing's jack spacing. */
  weight: number
  /** The plug's radius — see plugRadius in cableGeometry.ts. */
  plugRadius: number
  plugStyle: PlugStyle
  selected?: boolean
  /** Hovered: drawn solid, like a selected cable, so it stands out from the ones it crosses. */
  emphasized?: boolean
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
  plugRadius: number
  plugStyle: PlugStyle
  selected?: boolean
  emphasized?: boolean
  accent?: string
}

/** How solid a cable's body is when it isn't selected or hovered — enough to read as a cable,
 *  see-through enough that the labels of the rows it hangs across still show. */
const BODY_ALPHA = 0.8

/** The curve between two jacks, starting and ending where it meets each plug. */
function traceCable(ctx: Konva.Context, jackFrom: Pt, jackTo: Pt, sag: number, plug: number, style: PlugStyle): void {
  const { from, to } = cableEnds(jackFrom, jackTo, plug, style)
  const control = cableControlPoint(from, to, sag)
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.quadraticCurveTo(control.x, control.y, to.x, to.y)
}

/** Draws one cable by hand: a drooping curve with a dark outline under its colored core, so every
 *  color reads on white paper, and a plug at each end. On these drawings a jack's label is the jack
 *  itself, so the 'ring' style circles the label rather than covering it, and the cable leaves
 *  from the ring's bottom; the 'solid' style is the original disc on top. A plain function rather
 *  than only the component's sceneFunc, so the export (renderPatchbayImage.ts) draws cables exactly
 *  as the editor does. */
export function drawCable(
  ctx: Konva.Context,
  {
    from,
    to,
    color,
    sag,
    weight,
    plugRadius,
    plugStyle,
    selected = false,
    emphasized = false,
    accent = '#00a1ff'
  }: CableDrawOptions
): void {
  const outline = darken(color)
  const ring = plugStyle === 'ring'
  ctx.setAttr('lineCap', 'round')
  if (selected) {
    traceCable(ctx, from, to, sag, plugRadius, plugStyle)
    ctx.setAttr('strokeStyle', accent)
    ctx.setAttr('globalAlpha', 0.45)
    ctx.setAttr('lineWidth', weight * 2.6)
    ctx.stroke()
  }
  // See-through bodies go with the rings; solid plugs keep the original fully opaque cable.
  ctx.setAttr('globalAlpha', !ring || selected || emphasized ? 1 : BODY_ALPHA)
  traceCable(ctx, from, to, sag, plugRadius, plugStyle)
  ctx.setAttr('strokeStyle', outline)
  ctx.setAttr('lineWidth', weight * 1.35)
  ctx.stroke()
  traceCable(ctx, from, to, sag, plugRadius, plugStyle)
  ctx.setAttr('strokeStyle', color)
  ctx.setAttr('lineWidth', weight)
  ctx.stroke()
  // Rings at full strength whatever the body's, so the ends always read clearly.
  ctx.setAttr('globalAlpha', 1)
  for (const end of [from, to]) {
    if (!ring) {
      ctx.beginPath()
      ctx.arc(end.x, end.y, plugRadius, 0, Math.PI * 2)
      ctx.setAttr('fillStyle', color)
      ctx.fill()
      ctx.setAttr('strokeStyle', outline)
      ctx.setAttr('lineWidth', weight * 0.45)
      ctx.stroke()
      continue
    }
    if (selected) {
      ctx.beginPath()
      ctx.arc(end.x, end.y, plugRadius, 0, Math.PI * 2)
      ctx.setAttr('strokeStyle', accent)
      ctx.setAttr('globalAlpha', 0.45)
      ctx.setAttr('lineWidth', weight * 1.8)
      ctx.stroke()
      ctx.setAttr('globalAlpha', 1)
    }
    ctx.beginPath()
    ctx.arc(end.x, end.y, plugRadius, 0, Math.PI * 2)
    ctx.setAttr('strokeStyle', outline)
    ctx.setAttr('lineWidth', weight * 0.95)
    ctx.stroke()
    ctx.setAttr('strokeStyle', color)
    ctx.setAttr('lineWidth', weight * 0.6)
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
  plugRadius,
  plugStyle,
  selected = false,
  emphasized = false,
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
      sceneFunc={(ctx) =>
        drawCable(ctx, { from, to, color, sag, weight, plugRadius, plugStyle, selected, emphasized, accent })
      }
      hitFunc={(ctx, shape) => {
        traceCable(ctx, from, to, sag, plugRadius, plugStyle)
        ctx.strokeShape(shape)
        // Solid plugs can be grabbed too. Rings can't: their grab band would reach into the
        // neighboring jacks on a dense bay, so pressing next to a connected jack would select its
        // cable instead of starting a new one. A ringed cable is grabbed by its body.
        if (plugStyle !== 'solid') return
        for (const end of [from, to]) {
          ctx.beginPath()
          ctx.arc(end.x, end.y, plugRadius, 0, Math.PI * 2)
          ctx.strokeShape(shape)
        }
      }}
    />
  )
}
