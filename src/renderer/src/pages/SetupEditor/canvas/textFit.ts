// Shared offscreen canvas for text measurement — reused across calls instead of creating a new
// <canvas> element every time, since this runs on every block render while resizing.
let measureCanvas: HTMLCanvasElement | null = null
function getMeasureContext(): CanvasRenderingContext2D {
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  return measureCanvas.getContext('2d')!
}

/** Greedy word-wrap of `text` into lines that each fit within `maxWidth` at the context's current
 *  font — the same approach Konva's own `wrap="word"` uses internally, so this measurement tracks
 *  what actually gets drawn. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let current = words[0]
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
    } else {
      lines.push(current)
      current = words[i]
    }
  }
  lines.push(current)
  return lines
}

export interface FitFontSizeOptions {
  text: string
  maxWidth: number
  maxHeight: number
  maxFontSize: number
  minFontSize?: number
  fontStyle?: string
  fontFamily?: string
  /** Konva's default line height is 1x the font size; canvas text needs a little more breathing
   *  room than that to avoid lines visually touching, hence the default > 1. */
  lineHeightRatio?: number
}

/** Finds the largest font size (within `[minFontSize, maxFontSize]`) at which `text` — word-wrapped
 *  to `maxWidth` the same way Konva wraps it — fits within `maxHeight`. Used so Layout Mode block
 *  labels shrink to stay fully visible on small/resized blocks instead of being clipped by Konva's
 *  `ellipsis`, which only truncates at a single fixed size rather than scaling down first. Falls
 *  back to `minFontSize` if the text doesn't fit even there — `ellipsis` remains as a safety net on
 *  the `<Text>` node for that extreme case. */
export function fitFontSize({
  text,
  maxWidth,
  maxHeight,
  maxFontSize,
  minFontSize = 7,
  fontStyle = 'normal',
  fontFamily = 'Arial',
  lineHeightRatio = 1.2
}: FitFontSizeOptions): number {
  if (!text) return maxFontSize
  const ctx = getMeasureContext()
  const ceilingSize = Math.max(minFontSize, Math.floor(maxFontSize))
  for (let size = ceilingSize; size >= minFontSize; size--) {
    ctx.font = `${fontStyle} ${size}px ${fontFamily}`
    const lines = wrapLines(ctx, text, maxWidth)
    const totalHeight = lines.length * size * lineHeightRatio
    if (totalHeight <= maxHeight) return size
  }
  return minFontSize
}
