import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, GripVertical } from 'lucide-react'
import { onDragOverTick, useSortableSensors } from '@renderer/hooks/useSortableSensors'

export interface BandOrderEntry {
  /** Sortable id: the divider's id as a string. */
  id: string
  label: string
  startTime: string | null
}

interface Props {
  bands: BandOrderEntry[]
  /** The band new rows go into. */
  active: number
  onPick(band: number): void
  onMove(from: number, to: number): void
}

function BandRow({ band, index, active, onPick }: { band: BandOrderEntry; index: number; active: boolean; onPick(band: number): void }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: band.id })
  return (
    <div
      ref={setNodeRef}
      className="picker-menu-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1
      }}
    >
      <span
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label={`Move ${band.label}`}
        style={{ cursor: 'grab', color: 'var(--color-text-dim)', display: 'flex' }}
      >
        <GripVertical size={15} aria-hidden="true" />
      </span>
      <button
        className="band-order-pick"
        role="menuitemradio"
        aria-checked={active}
        onClick={() => onPick(index)}
      >
        <span style={{ width: 14, display: 'inline-flex' }}>{active && <Check size={14} aria-hidden="true" />}</span>
        {band.label}
        {band.startTime ? <span className="card-sub"> · {band.startTime}</span> : null}
      </button>
    </div>
  )
}

/** The bands in the stack menu: drag a handle to reorder them, the way the Columns menu reorders
 *  columns; click a name to make it the band new rows go into. */
export default function BandOrderList({ bands, active, onPick, onMove }: Props): JSX.Element {
  const sensors = useSortableSensors()
  const ids = bands.map((b) => b.id)

  function handleDragEnd(event: DragEndEvent): void {
    const { active: dragged, over } = event
    if (!over || dragged.id === over.id) return
    const from = ids.indexOf(String(dragged.id))
    const to = ids.indexOf(String(over.id))
    if (from !== -1 && to !== -1) onMove(from, to)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragOver={onDragOverTick} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {bands.map((band, i) => (
          <BandRow key={band.id} band={band} index={i} active={i === active} onPick={onPick} />
        ))}
      </SortableContext>
    </DndContext>
  )
}
