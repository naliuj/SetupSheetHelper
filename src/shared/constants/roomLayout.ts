// Blank-sheet convention for Layout Mode's "Continue with a Blank Sheet" option. Uses the same
// 144 px/inch convention the PDF layout-file render path already implies (LayoutBackground's
// RENDER_SCALE = 2 applied to a PDF's native 72 pt/inch), so a blank sheet sits at the same
// effective resolution as an uploaded PDF floor plan rather than introducing a second convention.
export const LAYOUT_PIXELS_PER_INCH = 144

/** The file types a room layout can be uploaded as — the open dialog's filter, and the source of
 *  the formats line shown beside every upload button, so the two can never disagree. */
export const LAYOUT_FILE_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] as const

/** Shown next to the layout upload buttons. Layout Mode draws only a PDF's first page (see
 *  LayoutBackground), which is worth saying before someone uploads a whole drawing set. */
export const LAYOUT_FILE_FORMATS_HINT =
  'Accepts a PDF, PNG, JPEG, GIF, WebP, BMP or SVG file. For a PDF with more than one page, only the first page is used.'
// Landscape (US Letter on its side) — a room floor plan is usually wider than it is tall.
export const BLANK_SHEET_WIDTH_IN = 11
export const BLANK_SHEET_HEIGHT_IN = 8.5
export const BLANK_SHEET_WIDTH_PX = BLANK_SHEET_WIDTH_IN * LAYOUT_PIXELS_PER_INCH
export const BLANK_SHEET_HEIGHT_PX = BLANK_SHEET_HEIGHT_IN * LAYOUT_PIXELS_PER_INCH

/** The room size an uploaded image layout is given: the image fitted onto a US Letter page —
 *  11 × 8.5 in for a wide (or square) image, 8.5 × 11 for a tall one — in the same 144 px/in units
 *  a PDF floor plan and a blank sheet use.
 *
 *  Without it an image's room was simply its pixel size, so everything measured in room pixels
 *  depended on the file's resolution: a 600 × 400 image printed at 4.2 × 2.8 in and made every new
 *  block and note look enormous, and a phone photo printed at 28 × 21 in with them looking tiny.
 *  A uniform scale keeps the drawing's proportions. Shared by LayoutBackground (which draws the
 *  image at this size) and migration 045 (which moved existing blocks onto it), so the two can
 *  never compute different numbers. */
export function normalizedLayoutSize(
  naturalWidth: number,
  naturalHeight: number
): { width: number; height: number; scale: number } {
  const wide = naturalWidth >= naturalHeight
  const maxWidth = wide ? BLANK_SHEET_WIDTH_PX : BLANK_SHEET_HEIGHT_PX
  const maxHeight = wide ? BLANK_SHEET_HEIGHT_PX : BLANK_SHEET_WIDTH_PX
  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight)
  return { width: naturalWidth * scale, height: naturalHeight * scale, scale }
}

// The pixelRatio every layout capture uses (konvaExport's exportStageToDataUrl, and the pop-out
// window's requestExportImage relay). Shared because the PDF has to undo it: it receives only the
// PNG, so the page size it gives that image is derived from the pixel dimensions, and a capture
// taken at a different ratio here would silently halve or double the printed page.
export const LAYOUT_EXPORT_PIXEL_RATIO = 2

/** PDF points for a captured layout PNG of `px` pixels. The stage is drawn in
 *  LAYOUT_PIXELS_PER_INCH units (a PDF floor plan is rasterised at RENDER_SCALE 2 over its native
 *  72 pt/inch; a blank sheet is defined in them outright), and the capture multiplies that again
 *  by LAYOUT_EXPORT_PIXEL_RATIO. */
export function layoutPixelsToPoints(px: number): number {
  return px / ((LAYOUT_PIXELS_PER_INCH / 72) * LAYOUT_EXPORT_PIXEL_RATIO)
}
