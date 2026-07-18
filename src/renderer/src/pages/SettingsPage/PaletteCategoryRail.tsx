import { useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, EyeOff } from 'lucide-react'

export interface RailCategory {
  name: string
  count: number
  /** A just-created, not-yet-persisted category (no blocks yet) — not draggable. */
  transient: boolean
}

interface Props {
  categories: RailCategory[]
  selection: string
  hiddenSentinel: string
  hiddenCount: number
  onSelect(selection: string): void
  onReorderCategories(newOrder: string[]): void
  onCreateCategory(name: string): void
}

function rowStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 9px',
    borderRadius: 7,
    marginBottom: 2,
    cursor: 'pointer',
    fontSize: 13,
    background: selected ? 'var(--color-accent)' : 'transparent',
    color: selected ? 'var(--color-on-accent)' : 'var(--color-text)',
    fontWeight: selected ? 600 : 400
  }
}

function CategoryRow({
  cat,
  selected,
  onSelect
}: {
  cat: RailCategory
  selected: boolean
  onSelect(): void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.name })
  return (
    <div
      ref={setNodeRef}
      onClick={onSelect}
      style={{ ...rowStyle(selected), transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
    >
      <span
        className="drag-handle"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        style={{ cursor: 'grab', color: selected ? 'var(--color-on-accent)' : 'var(--color-text-dim)', display: 'flex' }}
      >
        <GripVertical size={15} aria-hidden="true" />
      </span>
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.name}</span>
      <span style={{ fontSize: 11, opacity: selected ? 0.8 : 1, color: selected ? 'var(--color-on-accent)' : 'var(--color-text-dim)' }}>
        {cat.count}
      </span>
    </div>
  )
}

/** Left rail of the two-pane palette editor: the category list. Drag to reorder categories; the
 *  "+ New category" control names a category up front (no forced first block); a "Hidden" entry
 *  appears when built-ins have been hidden. */
export default function PaletteCategoryRail({
  categories,
  selection,
  hiddenSentinel,
  hiddenCount,
  onSelect,
  onReorderCategories,
  onCreateCategory
}: Props): JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const realNames = categories.filter((c) => !c.transient).map((c) => c.name)

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = realNames.indexOf(active.id as string)
    const newIndex = realNames.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    onReorderCategories(arrayMove(realNames, oldIndex, newIndex))
  }

  function commitNew(): void {
    const name = newName.trim()
    if (name) onCreateCategory(name)
    setNewName('')
    setCreating(false)
  }

  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        borderRight: '1px solid var(--color-border)',
        paddingRight: 14,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div className="section-title" style={{ margin: '0 0 8px', paddingLeft: 4 }}>
        Categories
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={realNames} strategy={verticalListSortingStrategy}>
          {categories.map((cat) =>
            cat.transient ? (
              <div key={cat.name} style={{ ...rowStyle(selection === cat.name), paddingLeft: 32 }} onClick={() => onSelect(cat.name)}>
                <span style={{ flex: 1, fontStyle: 'italic' }}>{cat.name}</span>
                <span style={{ fontSize: 11 }}>new</span>
              </div>
            ) : (
              <CategoryRow
                key={cat.name}
                cat={cat}
                selected={selection === cat.name}
                onSelect={() => onSelect(cat.name)}
              />
            )
          )}
        </SortableContext>
      </DndContext>

      {creating ? (
        <input
          autoFocus
          className="palette-input"
          placeholder="Category name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={commitNew}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitNew()
            if (e.key === 'Escape') {
              setNewName('')
              setCreating(false)
            }
          }}
          // `.palette-input` sets flex:1, which would stretch the field vertically inside this
          // flex column — pin it to its natural height.
          style={{ marginTop: 6, flex: '0 0 auto' }}
        />
      ) : (
        <button className="btn small" style={{ width: '100%', marginTop: 6, justifyContent: 'center' }} onClick={() => setCreating(true)}>
          + New category
        </button>
      )}

      {hiddenCount > 0 && (
        <>
          <div style={{ flex: 1, minHeight: 12 }} />
          <div
            onClick={() => onSelect(hiddenSentinel)}
            style={{ ...rowStyle(selection === hiddenSentinel), borderTop: '1px solid var(--color-border)', borderRadius: 0, paddingTop: 12, marginTop: 6 }}
          >
            <EyeOff size={15} aria-hidden="true" style={{ color: selection === hiddenSentinel ? 'var(--color-on-accent)' : 'var(--color-text-dim)' }} />
            <span style={{ flex: 1 }}>Hidden built-ins</span>
            <span style={{ fontSize: 11, color: selection === hiddenSentinel ? 'var(--color-on-accent)' : 'var(--color-text-dim)' }}>
              {hiddenCount}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
