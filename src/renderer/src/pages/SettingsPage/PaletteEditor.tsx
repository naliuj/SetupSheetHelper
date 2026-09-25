import { useEffect, useMemo, useState } from 'react'
import type { PaletteItem } from '@shared/types/palette'
import { usePaletteStore } from '@renderer/state/paletteStore'
import { groupByCategory } from '@renderer/state/paletteGrouping'
import PaletteCategoryRail, { type RailCategory } from './PaletteCategoryRail'
import PaletteBlockList from './PaletteBlockList'
import PaletteBlockChip from './PaletteBlockChip'

/** Sentinel "category" id for the Hidden built-ins view (real category names can't collide — a
 *  category is a user-facing label, and this is namespaced). */
const HIDDEN = '\0hidden'

/** Global palette editor — one shared, app-wide palette (not per-studio). Two-pane master/detail:
 *  categories on the left, the selected category's blocks on the right. Categories have no separate
 *  storage (they're a denormalized string on each item), so "create" is transient until the first
 *  block is added, and "delete" hard-removes custom blocks while soft-hiding built-ins (recoverable
 *  from the Hidden list). */
export default function PaletteEditor(): JSX.Element {
  const allItems = usePaletteStore((s) => s.allItems)
  const loadAll = usePaletteStore((s) => s.loadAll)
  const reorder = usePaletteStore((s) => s.reorder)
  const recategorize = usePaletteStore((s) => s.recategorize)
  const renameCategory = usePaletteStore((s) => s.renameCategory)
  const deleteCategory = usePaletteStore((s) => s.deleteCategory)
  const addCustom = usePaletteStore((s) => s.addCustom)
  const update = usePaletteStore((s) => s.update)
  const removeCustom = usePaletteStore((s) => s.removeCustom)
  const resetToDefaults = usePaletteStore((s) => s.resetToDefaults)

  const [selection, setSelection] = useState<string>('')
  /** A just-named, not-yet-persisted category (exists only until its first block is added). */
  const [newCategoryName, setNewCategoryName] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const visibleItems = useMemo(() => allItems.filter((i) => !i.isHidden), [allItems])
  const groups = useMemo(() => groupByCategory(visibleItems), [visibleItems])
  const categoryNames = useMemo(() => groups.map((g) => g.category), [groups])
  const hiddenItems = useMemo(() => allItems.filter((i) => i.isHidden), [allItems])

  const idsByCategory = (name: string): number[] => groups.find((g) => g.category === name)?.items.map((i) => i.id) ?? []

  const showTransient = newCategoryName != null && !categoryNames.includes(newCategoryName)
  const railCategories: RailCategory[] = [
    ...groups.map((g) => ({ name: g.category, count: g.items.length, transient: false })),
    ...(showTransient ? [{ name: newCategoryName as string, count: 0, transient: true }] : [])
  ]
  const railNames = railCategories.map((c) => c.name)

  // Keep the selection pointing at something real. Runs after loads, deletes, and merges.
  useEffect(() => {
    if (selection === HIDDEN) {
      if (hiddenItems.length === 0) setSelection(railNames[0] ?? '')
      return
    }
    if (selection && railNames.includes(selection)) return
    setSelection(railNames[0] ?? (hiddenItems.length ? HIDDEN : ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryNames.join('|'), newCategoryName, hiddenItems.length])

  function selectSection(sel: string): void {
    // Navigating away from an empty, unsaved category discards it (never persisted).
    if (newCategoryName && sel !== newCategoryName) setNewCategoryName(null)
    setSelection(sel)
  }

  function handleCreateCategory(name: string): void {
    if (categoryNames.includes(name)) {
      // Same name as an existing category — just jump to it rather than creating a duplicate.
      setNewCategoryName(null)
      setSelection(name)
      return
    }
    setNewCategoryName(name)
    setSelection(name)
  }

  function handleReorderCategories(newOrder: string[]): void {
    reorder(newOrder.flatMap(idsByCategory))
  }

  function handleReorderBlocks(category: string, orderedIds: number[]): void {
    reorder(categoryNames.flatMap((c) => (c === category ? orderedIds : idsByCategory(c))))
  }

  function handleAddBlock(
    category: string,
    label: string,
    shape: 'rect' | 'circle',
    color: string,
    labelColor: string | null
  ): void {
    // Once the block persists, `category` appears in categoryNames and `showTransient` flips false
    // on its own — so the transient row is replaced by the real one without a stale reselection.
    // Deliberately don't clear newCategoryName here (that would briefly drop the row from the rail
    // before the async load resolves, bouncing the selection away).
    addCustom(label, shape, color, category, labelColor)
  }

  function handleRemove(item: PaletteItem): void {
    if (item.isBuiltin) update(item.id, { isHidden: true })
    else removeCustom(item.id)
  }

  function handleMoveTo(id: number, toCat: string): void {
    const fromCat = allItems.find((i) => i.id === id)?.category
    const newFlat = categoryNames.flatMap((c) => {
      if (c === fromCat) return idsByCategory(c).filter((x) => x !== id)
      if (c === toCat) return [...idsByCategory(c), id]
      return idsByCategory(c)
    })
    recategorize(id, toCat, newFlat)
  }

  function handleRename(oldName: string, newName: string): void {
    renameCategory(oldName, newName)
    if (selection === oldName) setSelection(newName)
  }

  function confirmDelete(): void {
    if (deleteTarget) deleteCategory(deleteTarget)
    setDeleteTarget(null) // selection self-corrects via the effect once the category is gone
  }

  async function confirmReset(): Promise<void> {
    setResetting(true)
    try {
      await resetToDefaults()
      // The old category names are gone, so let the selection effect repoint at whatever exists.
      setNewCategoryName(null)
      setSelection('')
    } finally {
      setResetting(false)
      setResetOpen(false)
    }
  }

  const customCount = allItems.filter((i) => !i.isBuiltin).length

  const selectedGroup = groups.find((g) => g.category === selection)
  const isTransientSelected = selection === newCategoryName && !categoryNames.includes(selection)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <p className="card-sub" style={{ marginTop: 0, flex: 1 }}>
          Blocks you drag onto a room's floor plan in Layout Mode. Shared across every studio and setup.
        </p>
        <button className="btn small" onClick={() => setResetOpen(true)}>
          Reset palette…
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 440 }}>
        <PaletteCategoryRail
          categories={railCategories}
          selection={selection}
          hiddenSentinel={HIDDEN}
          hiddenCount={hiddenItems.length}
          onSelect={selectSection}
          onReorderCategories={handleReorderCategories}
          onCreateCategory={handleCreateCategory}
        />

        {selection === HIDDEN ? (
          <div style={{ flex: 1, minWidth: 0, padding: '4px 4px 4px 18px' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Hidden built-ins</h3>
            <p className="card-sub" style={{ marginTop: 0, marginBottom: 14 }}>
              Built-in blocks can't be deleted permanently — they're hidden here. Restore one to bring it back to its
              category.
            </p>
            {hiddenItems.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 10px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 9,
                  marginBottom: 8,
                  background: 'var(--color-surface)'
                }}
              >
                <PaletteBlockChip
                  label={item.label}
                  shape={item.shape}
                  color={item.color}
                  defaultWidth={item.defaultWidth}
                  defaultHeight={item.defaultHeight}
                  labelColor={item.labelColor}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{item.category}</div>
                </div>
                <button className="btn small" onClick={() => update(item.id, { isHidden: false })}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        ) : selection ? (
          <PaletteBlockList
            category={selection}
            transient={isTransientSelected}
            items={selectedGroup?.items ?? []}
            otherCategories={categoryNames.filter((c) => c !== selection)}
            onReorder={(ids) => handleReorderBlocks(selection, ids)}
            onAddBlock={(label, shape, color, labelColor) => handleAddBlock(selection, label, shape, color, labelColor)}
            onUpdate={(id, patch) => update(id, patch)}
            onRemove={handleRemove}
            onMoveTo={handleMoveTo}
            onRename={(newName) => handleRename(selection, newName)}
            onDelete={() => setDeleteTarget(selection)}
          />
        ) : (
          <div style={{ flex: 1, padding: '40px 18px', color: 'var(--color-text-dim)', fontSize: 13 }}>
            No categories yet. Use “+ New category” to add one.
          </div>
        )}
      </div>

      {resetOpen && (
        <div className="modal-overlay" onClick={() => setResetOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
            <h2 style={{ marginTop: 0 }}>Reset the whole palette?</h2>
            <p className="card-sub">
              Every block goes back to how it ships: original colors, shapes, categories and order,
              with hidden built-ins restored.
              {customCount > 0
                ? ` Your ${customCount} custom block${customCount === 1 ? '' : 's'} will be deleted.`
                : ''}{' '}
              This can't be undone.
            </p>
            <p className="card-sub">
              Blocks already placed on a floor plan keep their own label, shape and color, so no
              existing layout changes.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setResetOpen(false)} disabled={resetting}>
                Cancel
              </button>
              <button className="btn danger" onClick={confirmReset} disabled={resetting}>
                {resetting ? 'Resetting…' : 'Reset palette'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <h2 style={{ marginTop: 0 }}>Delete "{deleteTarget}"?</h2>
            <p className="card-sub">
              Custom blocks in this category are removed. Built-in blocks are hidden and can be restored later from the
              Hidden list. Removing custom blocks can't be undone.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn danger" onClick={confirmDelete}>
                Delete category
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
