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
