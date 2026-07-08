export const STAGGER_STEP = 90
export const COLUMNS_PER_ROW = 6
export const STAGGER_ORIGIN = { x: 40, y: 40 }

/** Cascade layout for items that don't carry a meaningful saved position (presets, templates, quick-added sources). */
export function staggeredPosition(slotIndex: number): { x: number; y: number } {
  return {
    x: STAGGER_ORIGIN.x + (slotIndex % COLUMNS_PER_ROW) * STAGGER_STEP,
    y: STAGGER_ORIGIN.y + Math.floor(slotIndex / COLUMNS_PER_ROW) * STAGGER_STEP
  }
}
