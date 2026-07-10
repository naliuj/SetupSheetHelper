import { useEffect, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { PaletteItem } from '@shared/types/palette'
import { usePaletteStore } from '@renderer/state/paletteStore'

function PaletteItemRow({ item }: { item: PaletteItem }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
  const update = usePaletteStore((s) => s.update)
  const removeCustom = usePaletteStore((s) => s.removeCustom)

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        opacity: item.isHidden ? 0.5 : 1,
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        marginBottom: 4
      }}
    >
      <span className="drag-handle" {...attributes} {...listeners} style={{ cursor: 'grab' }}>
        ⠿
      </span>
      <input type="color" value={item.color} onChange={(e) => update(item.id, { color: e.target.value })} />
      <input
        value={item.label}
        onChange={(e) => update(item.id, { label: e.target.value })}
        style={{
          flex: 1,
          padding: '8px 10px',
          borderRadius: 6,
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg)',
          color: 'var(--color-text)'
        }}
      />
      <input
        value={item.category}
        onChange={(e) => update(item.id, { category: e.target.value })}
        placeholder="Category"
        style={{
          width: 120,
          padding: '8px 10px',
          borderRadius: 6,
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg)',
          color: 'var(--color-text)'
        }}
      />
      {item.isBuiltin ? (
        <button className="btn small" onClick={() => update(item.id, { isHidden: !item.isHidden })}>
          {item.isHidden ? 'Show' : 'Hide'}
        </button>
      ) : (
        <button className="btn small danger" onClick={() => removeCustom(item.id)}>
          Remove
        </button>
      )}
    </div>
  )
}

/** Global palette editor — one shared, app-wide palette (not per-studio): reordering, hiding
 *  built-ins, and adding/removing custom entries here shows up in every studio's Layout Mode. */
export default function PaletteEditor(): JSX.Element {
  const allItems = usePaletteStore((s) => s.allItems)
  const loadAll = usePaletteStore((s) => s.loadAll)
  const reorder = usePaletteStore((s) => s.reorder)
  const addCustom = usePaletteStore((s) => s.addCustom)
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState('#6c7ba0')
  const [newCategory, setNewCategory] = useState('')
  const [newShape, setNewShape] = useState<'rect' | 'circle'>('rect')

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = allItems.findIndex((i) => i.id === active.id)
    const newIndex = allItems.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    reorder(arrayMove(allItems, oldIndex, newIndex).map((i) => i.id))
  }

  async function handleAdd(): Promise<void> {
    if (!newLabel.trim() || !newCategory.trim()) return
    await addCustom(newLabel.trim(), newShape, newColor, newCategory.trim())
    setNewLabel('')
    setNewCategory('')
  }

  return (
    <div>
      <p className="card-sub" style={{ marginTop: 0 }}>
        Reorder, hide, or add to the Layout Mode instrument palette — shared across every studio and setup.
      </p>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={allItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {allItems.map((item) => (
            <PaletteItemRow key={item.id} item={item} />
          ))}
        </SortableContext>
      </DndContext>

      <div className="inline-form" style={{ marginTop: 16 }}>
        <input placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        <input placeholder="Category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
        <select value={newShape} onChange={(e) => setNewShape(e.target.value as 'rect' | 'circle')}>
          <option value="rect">Rectangle</option>
          <option value="circle">Circle</option>
        </select>
        <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
        <button className="btn primary" onClick={handleAdd}>
          + Add Block Type
        </button>
      </div>
    </div>
  )
}
