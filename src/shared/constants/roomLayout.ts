// Blank-sheet convention for Layout Mode's "Continue with a Blank Sheet" option. Uses the same
// 144 px/inch convention the PDF layout-file render path already implies (LayoutBackground's
// RENDER_SCALE = 2 applied to a PDF's native 72 pt/inch), so a blank sheet sits at the same
// effective resolution as an uploaded PDF floor plan rather than introducing a second convention.
export const LAYOUT_PIXELS_PER_INCH = 144
// Landscape (US Letter on its side) — a room floor plan is usually wider than it is tall.
export const BLANK_SHEET_WIDTH_IN = 11
export const BLANK_SHEET_HEIGHT_IN = 8.5
export const BLANK_SHEET_WIDTH_PX = BLANK_SHEET_WIDTH_IN * LAYOUT_PIXELS_PER_INCH
export const BLANK_SHEET_HEIGHT_PX = BLANK_SHEET_HEIGHT_IN * LAYOUT_PIXELS_PER_INCH
