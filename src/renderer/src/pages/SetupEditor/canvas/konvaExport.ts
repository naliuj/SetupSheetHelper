import Konva from 'konva'
import { COLOR_SWATCHES, readableTextColor } from '@shared/constants/swatches'

// Flat, uniform fill for every block in black-and-white export mode (not a per-block pastel of
// its own color) — guarantees legible dark text regardless of the block's original color. Border
// is only needed in this mode since blocks otherwise rely on their fill color alone to read as
// distinct shapes against the background. Both verified against readableTextColor's own luminance
// formula: lightest resolves to dark text (safe as a fill), light resolves to white text (unsafe
// as a fill, fine as a border).
const MONOCHROME_BLOCK_FILL = COLOR_SWATCHES[0].lightest
const MONOCHROME_BLOCK_BORDER = COLOR_SWATCHES[0].light
const MONOCHROME_BORDER_WIDTH = 1.5

/** The on-screen stage is scaled/positioned to fit whatever room the window currently has
 *  (see LayoutStage.tsx), so a plain toDataURL() would only capture that shrunk viewport.
 *  Temporarily reset to the content's natural, untransformed size for the capture, then
 *  restore the on-screen fit afterward, so export quality is independent of window size.
 *
 *  `monochrome` desaturates the room background and flattens every block to the same light-gray
 *  fill for black-and-white printing (see ExportOptionsModal's "Colored rows" toggle) — done here,
 *  imperatively on the Konva nodes right before capture and reverted right after, rather than as
 *  React/store state, since the PDF generator never sees this stage: it only receives the PNG
 *  this function returns (see exportSetupPdf.ts's embedPng of layoutImageDataUrl). */
export function exportStageToDataUrl(stage: Konva.Stage, pixelRatio = 2, monochrome = false): string {
  const prevScale = { x: stage.scaleX(), y: stage.scaleY() }
  const prevPosition = { x: stage.x(), y: stage.y() }
  const prevSize = { width: stage.width(), height: stage.height() }

  const bounds = stage.getClientRect({ skipTransform: true })
  stage.scale({ x: 1, y: 1 })
  stage.position({ x: -bounds.x, y: -bounds.y })
  stage.size({ width: bounds.width, height: bounds.height })
  stage.batchDraw()

  let dataUrl: string
  if (monochrome) {
    const bgImage = stage.findOne<Konva.Image>('.layout-bg-image')
    const shapes = stage.find<Konva.Shape>('.block-shape')
    const labels = stage.find<Konva.Text>('.block-label')
    const prevShapeAttrs = shapes.map((s) => ({ fill: s.fill(), stroke: s.stroke(), strokeWidth: s.strokeWidth() }))
    const prevLabelAttrs = labels.map((l) => ({ fill: l.fill(), shadowColor: l.shadowColor() }))
    const monoLabelColor = readableTextColor(MONOCHROME_BLOCK_FILL)
    const monoLabelShadow = monoLabelColor === '#ffffff' ? '#000000' : '#ffffff'

    try {
      if (bgImage) {
        bgImage.cache({ pixelRatio })
        bgImage.filters([Konva.Filters.Grayscale])
      }
      shapes.forEach((s) => {
        s.fill(MONOCHROME_BLOCK_FILL)
        s.stroke(MONOCHROME_BLOCK_BORDER)
        s.strokeWidth(MONOCHROME_BORDER_WIDTH)
      })
      labels.forEach((l) => {
        l.fill(monoLabelColor)
        l.shadowColor(monoLabelShadow)
      })
      stage.batchDraw()

      dataUrl = stage.toDataURL({ pixelRatio })
    } finally {
      shapes.forEach((s, i) => {
        s.fill(prevShapeAttrs[i].fill)
        s.stroke(prevShapeAttrs[i].stroke)
        s.strokeWidth(prevShapeAttrs[i].strokeWidth)
      })
      labels.forEach((l, i) => {
        l.fill(prevLabelAttrs[i].fill)
        l.shadowColor(prevLabelAttrs[i].shadowColor)
      })
      bgImage?.clearCache()
      stage.batchDraw()
    }
  } else {
    dataUrl = stage.toDataURL({ pixelRatio })
  }

  stage.scale(prevScale)
  stage.position(prevPosition)
  stage.size(prevSize)
  stage.batchDraw()

  return dataUrl
}
