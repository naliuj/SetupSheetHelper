import { useEffect, useRef, useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { PaletteItem } from '@shared/types/palette'
import { DEFAULT_SWATCH } from '@shared/constants/swatches'
import SwatchPicker from '@renderer/components/SwatchPicker'
import PaletteBlockChip from './PaletteBlockChip'

interface Props {
  category: string
  /** A just-created, not-yet-persisted category — has no blocks and can't be renamed/deleted yet. */
  transient: boolean
  items: PaletteItem[]
  /** Every other category name, for the per-block "Move to…" menu. */
  otherCategories: string[]
  onReorder(orderedIds: number[]): void
  onAddBlock(label: string, shape: 'rect' | 'circle', color: string): void
  onUpdate(id: number, patch: Partial<Pick<PaletteItem, 'label' | 'shape' | 'color'>>): void
  onRemove(item: PaletteItem): void
  onMoveTo(id: number, toCategory: string): void
  onRename(newName: string): void
  onDelete(): void
}

function MoveToMenu({
  categories,
  onPick
}: {
  categories: string[]
  onPick: (category: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn small" disabled={categories.length === 0} onClick={() => setOpen((v) => !v)}>
        Move to ▾
      </button>
      {open && (
        <div
          className="picker-menu"
          style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, padding: 5, minWidth: 150, zIndex: 20 }}
        >
          {categories.map((c) => (
            <div
              key={c}
              onClick={() => {
                onPick(c)
                setOpen(false)
              }}
              style={{ fontSize: 12, padding: '6px 9px', borderRadius: 6, cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-alt)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BlockRow({
  item,
  otherCategories,
  onUpdate,
  onRemove,
  onMoveTo
}: {
  item: PaletteItem
  otherCategories: string[]
  onUpdate: Props['onUpdate']
  onRemove: Props['onRemove']
  onMoveTo: Props['onMoveTo']
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        border: '1px solid var(--color-border)',
        borderRadius: 9,
        marginBottom: 8,
        background: 'var(--color-surface)'
      }}
    >
      <span className="drag-handle" {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--color-text-dim)' }}>
        <GripVertical size={16} aria-hidden="true" />
      </span>
      <PaletteBlockChip label={item.label} shape={item.shape} color={item.color} />
      <input
        className="palette-input"
        value={item.label}
        onChange={(e) => onUpdate(item.id, { label: e.target.value })}
      />
      <SwatchPicker
        className="palette-color"
        value={item.color}
        onChange={(color) => color && onUpdate(item.id, { color })}
      />
      <select
        className="palette-select"
        value={item.shape}
        onChange={(e) => onUpdate(item.id, { shape: e.target.value as 'rect' | 'circle' })}
      >
        <option value="rect">Rectangle</option>
        <option value="circle">Circle</option>
      </select>
      <MoveToMenu categories={otherCategories} onPick={(c) => onMoveTo(item.id, c)} />
      <button
        className={item.isBuiltin ? 'btn small' : 'btn small danger'}
        onClick={() => onRemove(item)}
        title={item.isBuiltin ? 'Hide this built-in block (restore it later from the Hidden list)' : 'Remove this block'}
      >
        {item.isBuiltin ? 'Hide' : 'Remove'}
      </button>
    </div>
  )
}

/** Right pane of the two-pane palette editor: the selected category's blocks, with inline editing,
 *  drag-to-reorder within the category, an explicit "Move to…" recategorize, one-click removal, and
 *  an add-block form. Category rename/delete live in the header. */
export default function PaletteBlockList({
  category,
  transient,
  items,
  otherCategories,
  onReorder,
  onAddBlock,
  onUpdate,
  onRemove,
  onMoveTo,
  onRename,
  onDelete
}: Props): JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(category)
  const [addLabel, setAddLabel] = useState('')
  const [addColor, setAddColor] = useState(DEFAULT_SWATCH)
  const [addShape, setAddShape] = useState<'rect' | 'circle'>('rect')

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = items.map((i) => i.id)
    const oldIndex = ids.indexOf(active.id as number)
    const newIndex = ids.indexOf(over.id as number)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(ids, oldIndex, newIndex))
  }

  function commitRename(): void {
    const next = renameValue.trim()
    if (next && next !== category) onRename(next)
    setRenaming(false)
  }

  function commitAdd(): void {
    const label = addLabel.trim()
    if (!label) return
    onAddBlock(label, addShape, addColor)
    setAddLabel('')
  }

  return (
    <div style={{ flex: 1, minWidth: 0, padding: '4px 4px 4px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setRenameValue(category)
                setRenaming(false)
              }
            }}
            style={{
              fontSize: 16,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid var(--color-accent)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)'
            }}
          />
        ) : (
          <h3 style={{ margin: 0, fontSize: 16 }}>{category || 'New category'}</h3>
        )}
        <span
          style={{
            fontSize: 11,
            color: 'var(--color-text-dim)',
            border: '1px solid var(--color-border)',
            borderRadius: 20,
            padding: '1px 8px'
          }}
        >
          {items.length} block{items.length === 1 ? '' : 's'}
        </span>
        <span style={{ flex: 1 }} />
        {!transient && !renaming && (
          <>
            <button
              className="btn small"
              onClick={() => {
                setRenameValue(category)
                setRenaming(true)
              }}
            >
              Rename
            </button>
            <button className="btn small danger" onClick={onDelete}>
              Delete category
            </button>
          </>
        )}
      </div>
      <p className="card-sub" style={{ marginTop: 0, marginBottom: 14 }}>
        {transient
          ? 'Add the first block below to create this category.'
          : 'Drag to reorder. Use “Move to…” to send a block to another category.'}
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <BlockRow
              key={item.id}
              item={item}
              otherCategories={otherCategories}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onMoveTo={onMoveTo}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 4,
          padding: '8px 10px',
          border: '1px dashed var(--color-border)',
          borderRadius: 9
        }}
      >
        <input
          className="palette-input"
          placeholder="New block label"
          value={addLabel}
          onChange={(e) => setAddLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commitAdd()}
        />
        <select
          className="palette-select"
          value={addShape}
          onChange={(e) => setAddShape(e.target.value as 'rect' | 'circle')}
        >
          <option value="rect">Rectangle</option>
          <option value="circle">Circle</option>
        </select>
        <SwatchPicker className="palette-color" value={addColor} onChange={(color) => setAddColor(color ?? DEFAULT_SWATCH)} />
        <button className="btn small primary" onClick={commitAdd} disabled={!addLabel.trim()}>
          + Add block
        </button>
      </div>
    </div>
  )
}
