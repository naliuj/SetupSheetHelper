import { useEffect, useMemo, useState } from 'react'
import { DndContext, PointerSensor, closestCorners, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { PaletteItem } from '@shared/types/palette'
import { usePaletteStore } from '@renderer/state/paletteStore'
import { groupByCategory } from '@renderer/state/paletteGrouping'
import PaletteCategorySection, { catHeaderId } from './PaletteCategorySection'

interface Group {
  category: string
  itemIds: number[]
}

function buildGroups(items: PaletteItem[]): Group[] {
  return groupByCategory(items).map(({ category, items }) => ({ category, itemIds: items.map((i) => i.id) }))
}

const isCategoryDrag = (id: string | number): id is string => typeof id === 'string' && id.startsWith('cat:')

/** Global palette editor — one shared, app-wide palette (not per-studio). Items are grouped into
 *  collapsible category sections; drag an item into another section to recategorize it, drag a
 *  section header to reorder categories. Category order and within-category order both live in the
 *  flat `sortOrder` (persisted via reorder), so there is no separate category-order storage. */
export default function PaletteEditor(): JSX.Element {
  const allItems = usePaletteStore((s) => s.allItems)
  const loadAll = usePaletteStore((s) => s.loadAll)
  const reorder = usePaletteStore((s) => s.reorder)
  const recategorize = usePaletteStore((s) => s.recategorize)
  const renameCategory = usePaletteStore((s) => s.renameCategory)
  const addCustom = usePaletteStore((s) => s.addCustom)

  const [groups, setGroups] = useState<Group[]>(() => buildGroups(allItems))
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatLabel, setNewCatLabel] = useState('')
  const [newCatColor, setNewCatColor] = useState('#6c7ba0')
  const [newCatShape, setNewCatShape] = useState<'rect' | 'circle'>('rect')

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Re-derive the grouped view whenever the store's items change (after any persist + reload).
  // Optimistic store updates already match what we compute here, so this is idempotent mid-drag.
  useEffect(() => {
    setGroups(buildGroups(allItems))
  }, [allItems])

  const itemsById = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const flatten = (gs: Group[]): number[] => gs.flatMap((g) => g.itemIds)
  const categoryOfItem = (gs: Group[], id: number): string | undefined =>
    gs.find((g) => g.itemIds.includes(id))?.category

  /** Resolve any drop target (an item id, a `cat:` header, or a `drop:` section body) to a category. */
  function containerOf(gs: Group[], overId: string | number): string | undefined {
    if (typeof overId === 'number') return categoryOfItem(gs, overId)
    if (overId.startsWith('cat:')) return overId.slice(4)
    if (overId.startsWith('drop:')) return overId.slice(5)
    return undefined
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over) return

    if (isCategoryDrag(active.id)) {
      const activeCat = active.id.slice(4)
      const overCat = containerOf(groups, over.id)
      if (!overCat || overCat === activeCat) return
      const oldIndex = groups.findIndex((g) => g.category === activeCat)
      const newIndex = groups.findIndex((g) => g.category === overCat)
      if (oldIndex === -1 || newIndex === -1) return
      const next = arrayMove(groups, oldIndex, newIndex)
      setGroups(next)
      reorder(flatten(next))
      return
    }

    const itemId = active.id as number
    const fromCat = categoryOfItem(groups, itemId)
    const toCat = containerOf(groups, over.id)
    if (!fromCat || !toCat) return

    if (fromCat === toCat) {
      if (typeof over.id !== 'number' || over.id === itemId) return
      const next = groups.map((g) => {
        if (g.category !== fromCat) return g
        const oldIndex = g.itemIds.indexOf(itemId)
        const newIndex = g.itemIds.indexOf(over.id as number)
        if (oldIndex === -1 || newIndex === -1) return g
        return { ...g, itemIds: arrayMove(g.itemIds, oldIndex, newIndex) }
      })
      setGroups(next)
      reorder(flatten(next))
      return
    }

    // Cross-category move: pull the item out of its group and splice it into the target group at
    // the drop position (before the item it was dropped on, or the end when dropped on the header/body).
    const next = groups.map((g) => {
      if (g.category === fromCat) return { ...g, itemIds: g.itemIds.filter((id) => id !== itemId) }
      if (g.category === toCat) {
        const insertAt = typeof over.id === 'number' ? g.itemIds.indexOf(over.id) : g.itemIds.length
        const itemIds = [...g.itemIds]
        itemIds.splice(insertAt === -1 ? itemIds.length : insertAt, 0, itemId)
        return { ...g, itemIds }
      }
      return g
    })
    setGroups(next)
    recategorize(itemId, toCat, flatten(next))
  }

  function toggleCollapse(category: string): void {
    setCollapsed((prev) => {
      const nextSet = new Set(prev)
      if (nextSet.has(category)) nextSet.delete(category)
      else nextSet.add(category)
      return nextSet
    })
  }

  function commitNewCategory(): void {
    const name = newCatName.trim()
    const label = newCatLabel.trim()
    if (!name || !label) return
    // A category exists only while it has ≥1 item, so creating one means adding its first block.
    addCustom(label, newCatShape, newCatColor, name)
    setAddingCategory(false)
    setNewCatName('')
    setNewCatLabel('')
  }

  return (
    <div>
      <p className="card-sub" style={{ marginTop: 0 }}>
        Drag an item into another category to recategorize it, or drag a category header to reorder.
        Shared across every studio and setup.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <SortableContext items={groups.map((g) => catHeaderId(g.category))} strategy={verticalListSortingStrategy}>
          {groups.map((group) => (
            <PaletteCategorySection
              key={group.category}
              category={group.category}
              items={group.itemIds.map((id) => itemsById.get(id)).filter((i): i is PaletteItem => i != null)}
              collapsed={collapsed.has(group.category)}
              onToggleCollapse={() => toggleCollapse(group.category)}
              onRename={(newName) => renameCategory(group.category, newName)}
              onAddItem={(label, shape, color) => addCustom(label, shape, color, group.category)}
            />
          ))}
        </SortableContext>
      </DndContext>

      {addingCategory ? (
        <div
          style={{
            border: '1px dashed var(--color-border)',
            borderRadius: 8,
            padding: 8,
            marginTop: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="palette-input"
              placeholder="Category name"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
            />
            <input
              className="palette-input"
              placeholder="First block label"
              value={newCatLabel}
              onChange={(e) => setNewCatLabel(e.target.value)}
            />
            <select
              className="palette-select"
              value={newCatShape}
              onChange={(e) => setNewCatShape(e.target.value as 'rect' | 'circle')}
            >
              <option value="rect">Rectangle</option>
              <option value="circle">Circle</option>
            </select>
            <input
              type="color"
              className="palette-color"
              value={newCatColor}
              onChange={(e) => setNewCatColor(e.target.value)}
            />
            <button className="btn small primary" onClick={commitNewCategory}>
              Create
            </button>
            <button className="btn small" onClick={() => setAddingCategory(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn" style={{ marginTop: 10 }} onClick={() => setAddingCategory(true)}>
          + New category
        </button>
      )}
    </div>
  )
}
