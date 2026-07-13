import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import type { PaletteItem } from '@shared/types/palette'
import { usePaletteStore } from '@renderer/state/paletteStore'
import { DEFAULT_SWATCH } from '@shared/constants/swatches'
import SwatchPicker from '@renderer/components/SwatchPicker'

/** dnd id namespacing — item ids are raw numbers; category headers/section bodies are strings so
 *  the editor's drag handlers can tell which kind of thing is being dragged or dropped onto. */
export const catHeaderId = (category: string): string => `cat:${category}`
export const catBodyId = (category: string): string => `drop:${category}`

function PaletteItemRow({ item }: { item: PaletteItem }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
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
        padding: '4px 6px',
        opacity: item.isHidden ? 0.5 : isDragging ? 0.4 : 1,
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        marginBottom: 4,
        background: 'var(--color-surface)'
      }}
    >
      <span className="drag-handle" {...attributes} {...listeners} style={{ cursor: 'grab' }}>
        <GripVertical size={16} aria-hidden="true" />
      </span>
      <SwatchPicker
        className="palette-color"
        value={item.color}
        onChange={(color) => color && update(item.id, { color })}
      />
      <input
        className="palette-input"
        value={item.label}
        onChange={(e) => update(item.id, { label: e.target.value })}
      />
      <select
        className="palette-select"
        value={item.shape}
        onChange={(e) => update(item.id, { shape: e.target.value as 'rect' | 'circle' })}
      >
        <option value="rect">Rectangle</option>
        <option value="circle">Circle</option>
      </select>
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

interface SectionProps {
  category: string
  items: PaletteItem[]
  collapsed: boolean
  onToggleCollapse(): void
  onRename(newName: string): void
  onAddItem(label: string, shape: 'rect' | 'circle', color: string): void
}

export default function PaletteCategorySection({
  category,
  items,
  collapsed,
  onToggleCollapse,
  onRename,
  onAddItem
}: SectionProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: catHeaderId(category) })
  const { setNodeRef: setBodyRef, isOver } = useDroppable({ id: catBodyId(category) })

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(category)
  const [addLabel, setAddLabel] = useState('')
  const [addColor, setAddColor] = useState(DEFAULT_SWATCH)
  const [addShape, setAddShape] = useState<'rect' | 'circle'>('rect')
  const [adding, setAdding] = useState(false)

  function commitRename(): void {
    const next = renameValue.trim()
    if (next && next !== category) onRename(next)
    setRenaming(false)
  }

  function commitAdd(): void {
    if (!addLabel.trim()) return
    onAddItem(addLabel.trim(), addShape, addColor)
    setAddLabel('')
    setAdding(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        marginBottom: 10,
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          background: 'var(--color-surface-alt)',
          borderBottom: '1px solid var(--color-border)'
        }}
      >
        <span className="drag-handle" {...attributes} {...listeners} style={{ cursor: 'grab' }} title="Drag to reorder category">
          <GripVertical size={16} aria-hidden="true" />
        </span>
        <span
          onClick={onToggleCollapse}
          className="inline-icon-text"
          style={{ cursor: 'pointer', color: 'var(--color-text-dim)', width: 14 }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </span>
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
              flex: 1,
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid var(--color-accent)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              fontWeight: 600
            }}
          />
        ) : (
          <>
            <span
              onClick={onToggleCollapse}
              style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', cursor: 'pointer' }}
            >
              {category}
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>{items.length}</span>
            <span style={{ flex: 1 }} />
            <button
              className="btn small"
              onClick={() => {
                setRenameValue(category)
                setRenaming(true)
              }}
            >
              Rename
            </button>
          </>
        )}
      </div>

      {!collapsed && (
        <div
          ref={setBodyRef}
          style={{ padding: 8, background: isOver ? 'var(--color-surface-alt)' : 'transparent' }}
        >
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <PaletteItemRow key={item.id} item={item} />
            ))}
          </SortableContext>

          {adding ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <input
                autoFocus
                className="palette-input"
                placeholder="Label"
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
              <SwatchPicker
                className="palette-color"
                value={addColor}
                onChange={(color) => setAddColor(color ?? DEFAULT_SWATCH)}
              />
              <button className="btn small primary" onClick={commitAdd}>
                Add
              </button>
              <button className="btn small" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="btn small"
              style={{ width: '100%', marginTop: 4 }}
              onClick={() => setAdding(true)}
            >
              + Add to {category}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
