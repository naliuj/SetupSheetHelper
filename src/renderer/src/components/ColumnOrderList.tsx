import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Lock } from 'lucide-react'
import {
  COLUMN_LABELS,
  PINNED_COLUMN_KEYS,
  parseColumnOrder,
  type SetupColumnKey
} from '@shared/constants/setupColumns'
import ToggleSwitch from './ToggleSwitch'

interface Props {
  /** Every column key in the user's left-to-right order — hidden ones included, so they keep their
   *  place while switched off. */
  order: SetupColumnKey[]
  visible: SetupColumnKey[]
  onReorder: (order: SetupColumnKey[]) => void
  onToggle: (key: SetupColumnKey, visible: boolean) => void
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '3px 2px'
}

/** A single non-draggable row — "Source name" (always shown, no toggle) and the pinned stereo-link
 *  column (toggleable, just not movable). Reads as deliberately locked rather than broken. */
function PinnedRow({
  label,
  toggle
}: {
  label: string
  toggle?: { checked: boolean; onChange: (on: boolean) => void }
}): JSX.Element {
  return (
    <div style={{ ...rowStyle, opacity: 0.75 }}>
      <span style={{ display: 'flex', color: 'var(--color-text-dim)' }} title="Always first">
        <Lock size={13} aria-hidden="true" />
      </span>
      {toggle ? (
        <ToggleSwitch checked={toggle.checked} onChange={toggle.onChange} label={label} />
      ) : (
        <>
          <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>always</span>
        </>
      )}
    </div>
  )
}

function ColumnRow({
  columnKey,
  checked,
  onToggle
}: {
  columnKey: SetupColumnKey
  checked: boolean
  onToggle: (on: boolean) => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: columnKey })
  return (
    <div
      ref={setNodeRef}
      style={{
        ...rowStyle,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : checked ? 1 : 0.55
      }}
    >
      <span
        className="drag-handle"
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', color: 'var(--color-text-dim)', display: 'flex' }}
      >
        <GripVertical size={15} aria-hidden="true" />
      </span>
      <ToggleSwitch checked={checked} onChange={onToggle} label={COLUMN_LABELS[columnKey]} />
    </div>
  )
}

/** Drag-to-reorder + show/hide list for the setup sheet's columns. Shared by the per-setup Columns
 *  popover and the global default in Settings, so the two can't drift.
 *
 *  Top-to-bottom here is left-to-right in the sheet. Hidden columns stay in the list (dimmed)
 *  rather than dropping out, which is the whole reason order is stored for every key: toggle one
 *  off and back on and it returns to where you put it. */
export default function ColumnOrderList({ order, visible, onReorder, onToggle }: Props): JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const visibleSet = new Set(visible)
  const fullOrder = parseColumnOrder(JSON.stringify(order))
  const draggable = fullOrder.filter((k) => !PINNED_COLUMN_KEYS.includes(k))

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = draggable.indexOf(active.id as SetupColumnKey)
    const newIndex = draggable.indexOf(over.id as SetupColumnKey)
    if (oldIndex === -1 || newIndex === -1) return
    // Pinned keys always lead, so the stored order stays a complete list in render order.
    onReorder([...PINNED_COLUMN_KEYS, ...arrayMove(draggable, oldIndex, newIndex)])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <PinnedRow label="Source name" />
      {PINNED_COLUMN_KEYS.map((key) => (
        <PinnedRow
          key={key}
          label={COLUMN_LABELS[key]}
          toggle={{ checked: visibleSet.has(key), onChange: (on) => onToggle(key, on) }}
        />
      ))}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={draggable} strategy={verticalListSortingStrategy}>
          {draggable.map((key) => (
            <ColumnRow
              key={key}
              columnKey={key}
              checked={visibleSet.has(key)}
              onToggle={(on) => onToggle(key, on)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}
