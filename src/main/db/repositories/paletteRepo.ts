import type { PaletteItem } from '@shared/types/palette'
import { getDb } from '../index'

interface PaletteItemRow {
  id: number
  instrument_key: string | null
  label: string
  shape: 'rect' | 'circle'
  color: string
  category: string
  is_builtin: number
  is_hidden: number
  sort_order: number
}

function mapRow(row: PaletteItemRow): PaletteItem {
  return {
    id: row.id,
    instrumentKey: row.instrument_key,
    label: row.label,
    shape: row.shape,
    color: row.color,
    category: row.category,
    isBuiltin: row.is_builtin === 1,
    isHidden: row.is_hidden === 1,
    sortOrder: row.sort_order
  }
}

/** Every non-hidden palette item, in persisted order — what the live Layout Mode palette renders. */
export function listVisiblePaletteItems(): PaletteItem[] {
  const rows = getDb()
    .prepare('SELECT * FROM palette_items WHERE is_hidden = 0 ORDER BY sort_order')
    .all() as PaletteItemRow[]
  return rows.map(mapRow)
}

/** Every item including hidden built-ins — powers the "Layout Palette" management editor, which
 *  needs to show hidden built-ins too (so the user can toggle them back on). */
export function listAllPaletteItems(): PaletteItem[] {
  const rows = getDb().prepare('SELECT * FROM palette_items ORDER BY sort_order').all() as PaletteItemRow[]
  return rows.map(mapRow)
}

export function createCustomPaletteItem(input: {
  label: string
  shape: 'rect' | 'circle'
  color: string
  category: string
}): PaletteItem {
  const db = getDb()
  const maxSortOrder = (db.prepare('SELECT MAX(sort_order) as m FROM palette_items').get() as { m: number | null }).m
  const info = db
    .prepare(
      `INSERT INTO palette_items (instrument_key, label, shape, color, category, is_builtin, sort_order)
       VALUES (NULL, ?, ?, ?, ?, 0, ?)`
    )
    .run(input.label, input.shape, input.color, input.category, (maxSortOrder ?? 0) + 1)
  const row = db.prepare('SELECT * FROM palette_items WHERE id = ?').get(info.lastInsertRowid) as PaletteItemRow
  return mapRow(row)
}

export function updatePaletteItem(
  id: number,
  patch: Partial<Pick<PaletteItem, 'label' | 'shape' | 'color' | 'category' | 'isHidden'>>
): PaletteItem {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM palette_items WHERE id = ?').get(id) as PaletteItemRow
  db.prepare(
    'UPDATE palette_items SET label = ?, shape = ?, color = ?, category = ?, is_hidden = ? WHERE id = ?'
  ).run(
    patch.label ?? existing.label,
    patch.shape ?? existing.shape,
    patch.color ?? existing.color,
    patch.category ?? existing.category,
    patch.isHidden != null ? (patch.isHidden ? 1 : 0) : existing.is_hidden,
    id
  )
  const row = db.prepare('SELECT * FROM palette_items WHERE id = ?').get(id) as PaletteItemRow
  return mapRow(row)
}

/** Custom (non-builtin) items can be hard-deleted outright — only built-ins get soft-hidden
 *  (via updatePaletteItem's isHidden patch) so they survive future reseeds correctly. */
export function removeCustomPaletteItem(id: number): void {
  getDb().prepare('DELETE FROM palette_items WHERE id = ? AND is_builtin = 0').run(id)
}

/** Renames a category by rewriting the (denormalized) category string on every item in it.
 *  Renaming onto an existing category name merges the two groups. */
export function renameCategoryPaletteItems(oldName: string, newName: string): void {
  getDb().prepare('UPDATE palette_items SET category = ? WHERE category = ?').run(newName, oldName)
}

/** Persists a full drag-and-drop reorder — assigns sequential sort_order in the given id order. */
export function reorderPaletteItems(ids: number[]): void {
  const db = getDb()
  const stmt = db.prepare('UPDATE palette_items SET sort_order = ? WHERE id = ?')
  const reorder = db.transaction(() => {
    ids.forEach((id, index) => stmt.run(index, id))
  })
  reorder()
}
