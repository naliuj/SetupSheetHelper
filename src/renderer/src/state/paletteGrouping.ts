import type { PaletteItem } from '@shared/types/palette'

/** Categories in first-appearance order across the given items. Since palette items always arrive
 *  sorted by `sortOrder` (the repo does `ORDER BY sort_order`), and items sharing a category are
 *  kept contiguous, this yields the user's custom category order — no separate stored ordering. */
export function categoriesInOrder(items: PaletteItem[]): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  for (const item of items) {
    if (!seen.has(item.category)) {
      seen.add(item.category)
      order.push(item.category)
    }
  }
  return order
}

export interface PaletteGroup {
  category: string
  items: PaletteItem[]
}

/** Buckets items by category, preserving both category order (first appearance) and within-group
 *  order (input order). Pass already-filtered items to group a search result. */
export function groupByCategory(items: PaletteItem[]): PaletteGroup[] {
  const map = new Map<string, PaletteItem[]>()
  for (const item of items) {
    const list = map.get(item.category) ?? []
    list.push(item)
    map.set(item.category, list)
  }
  return categoriesInOrder(items).map((category) => ({ category, items: map.get(category)! }))
}
