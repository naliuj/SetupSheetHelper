import Konva from 'konva'
import { PATCHBAY_RENDER_SCALE } from '@shared/types/patchbay'
import { appFileUrl, PDF_RENDER_SCALE, renderPdfPage } from '../canvas/renderPdfPage'
import { drawCable } from './PatchbayCable'
import { usePatchbayPrefsStore } from '@renderer/state/patchbayPrefsStore'
import { cableBounds, cableEnds, cableWeight, plugRadius as plugRadiusFor, PointIndex } from './cableGeometry'

/** The most pixels an export image is allowed: about a 6000 × 6000 picture. A Letter-size drawing
 *  stays at the full 2× sharpness well under it; a very wide drawing is rendered less sharply
 *  instead of allocating canvases big enough to stall the app. */
const MAX_EXPORT_PIXELS = 36e6
/** The sharpest an export image is rendered, over the drawing's room pixels. */
const MAX_EXPORT_RATIO = 2

/** `roomWidth`/`roomHeight` are the picture's size in room pixels (2× PDF points, see
 *  PATCHBAY_RENDER_SCALE), which is how the PDF and spreadsheet print it at true size: the PNG's
 *  own pixel size depends on how sharply it was rendered. 'none' means the studio has no drawing. */
export type PatchbayImageResult =
  | { status: 'ok'; dataUrl: string; roomWidth: number; roomHeight: number }
  | { status: 'none' }

interface Options {
  studioId: number | null
  setupId: number | null
  /** Grays the whole picture, drawing and cables alike, for black-and-white printing. */
  monochrome: boolean
}

/** Flattens a setup's patchbay — the studio's drawing with this setup's cables on it — to a PNG.
 *
 *  Rendered offscreen from the database rather than captured from Patchbay Mode's stage: that
 *  stage may never have mounted (an export from Table Mode), holds the drawing at the editor's 2×,
 *  and has hover, selection and a half-drawn cable baked into whatever it shows. So the drawing is
 *  rendered fresh, cables are drawn by the same drawCable the editor uses, every one unselected, and
 *  the picture grows past the drawing's edges where a cable droops beyond them. Callers save the
 *  patchbay store first, so the cables read here are the ones on screen. */
export async function renderPatchbayImage({ studioId, setupId, monochrome }: Options): Promise<PatchbayImageResult> {
  const patchbay = studioId ? await window.api.patchbay.getForStudio(studioId) : null
  if (!patchbay) return { status: 'none' }
  // Already in drawing order (z_index, then id), so later cables cross over earlier ones as on screen.
  const cables = setupId ? await window.api.patchbay.listCables(setupId) : []

  const drawingWidth = patchbay.file.pageWidthPt * PATCHBAY_RENDER_SCALE
  const drawingHeight = patchbay.file.pageHeightPt * PATCHBAY_RENDER_SCALE
  const radius = new PointIndex(patchbay.points).radius
  const weight = cableWeight(radius)
  // The plug style is app-wide, so the export draws plugs the way the editor shows them. Loaded
  // here because the store only loads when Patchbay Mode opens, and an export can come first.
  await usePatchbayPrefsStore.getState().load()
  const plugStyle = usePatchbayPrefsStore.getState().plugStyle
  const plugRadius = plugRadiusFor(radius, plugStyle)

  // The picture covers the drawing plus every cable, plugs included: each plug reaches plugRadius
  // from its jack, with an outline up to the weight wide on top.
  const pad = plugRadius + weight
  let left = 0
  let top = 0
  let right = drawingWidth
  let bottom = drawingHeight
  for (const c of cables) {
    const ends = cableEnds({ x: c.fromX, y: c.fromY }, { x: c.toX, y: c.toY }, plugRadius, plugStyle)
    const b = cableBounds(ends.from, ends.to, c.sag)
    left = Math.min(left, b.left - pad)
    top = Math.min(top, b.top - pad)
    right = Math.max(right, b.right + pad)
    bottom = Math.max(bottom, b.bottom + pad)
  }
  const width = right - left
  const height = bottom - top
  const ratio = Math.min(MAX_EXPORT_RATIO, Math.sqrt(MAX_EXPORT_PIXELS / (width * height)))

  // Rendered at the export's own sharpness and drawn back at room size, so the drawing is as crisp
  // as the cables over it rather than an upscaled copy of the editor's 2× bitmap.
  const rendered = await renderPdfPage(appFileUrl(patchbay.file.filePath), PDF_RENDER_SCALE * ratio)

  // Konva gives every canvas it makes the screen's pixel ratio. The stage's own canvases are never
  // shown and only the export below needs the sharpness, so they are made at 1× — on a Retina
  // screen that is a quarter of the memory for a drawing that may already be very large. Built
  // synchronously, so nothing else in the app can create a canvas while the ratio is swapped.
  const screenRatio = Konva.pixelRatio
  Konva.pixelRatio = 1
  let stage: Konva.Stage
  let layer: Konva.Layer
  try {
    stage = new Konva.Stage({ container: document.createElement('div'), width, height })
    layer = new Konva.Layer({ listening: false })
    stage.add(layer)
  } finally {
    Konva.pixelRatio = screenRatio
  }

  let exported: HTMLCanvasElement | null = null
  let gray: HTMLCanvasElement | null = null
  try {
    // White under everything: past the drawing's edges the picture would otherwise be transparent,
    // which a spreadsheet shows as its own background color.
    layer.add(new Konva.Rect({ x: 0, y: 0, width, height, fill: '#ffffff' }))
    const content = new Konva.Group({ x: -left, y: -top })
    content.add(new Konva.Image({ image: rendered.image, width: drawingWidth, height: drawingHeight }))
    for (const c of cables) {
      content.add(
        new Konva.Shape({
          sceneFunc: (ctx) =>
            drawCable(ctx, {
              from: { x: c.fromX, y: c.fromY },
              to: { x: c.toX, y: c.toY },
              color: c.color,
              sag: c.sag,
              weight,
              plugRadius,
              plugStyle
            })
        })
      )
    }
    layer.add(content)

    // The layer straight to a canvas, not stage.toCanvas, which renders each layer and then copies
    // it onto one more canvas of the same size.
    exported = layer.toCanvas({ x: 0, y: 0, width, height, pixelRatio: ratio })
    let output = exported
    if (monochrome) {
      gray = document.createElement('canvas')
      gray.width = exported.width
      gray.height = exported.height
      const ctx = gray.getContext('2d')
      if (!ctx) throw new Error('Failed to get a 2D context to gray the patchbay')
      ctx.filter = 'grayscale(1)'
      ctx.drawImage(exported, 0, 0)
      output = gray
    }
    return { status: 'ok', dataUrl: output.toDataURL('image/png'), roomWidth: width, roomHeight: height }
  } finally {
    stage.destroy()
    // Zeroing a canvas frees its pixels now rather than whenever it is next collected — these are
    // the largest allocations an export makes.
    for (const canvas of [rendered.image, exported, gray]) if (canvas) canvas.width = 0
  }
}
