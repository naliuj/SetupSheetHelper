import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useSetupStore } from '@renderer/state/setupStore'
import { useCatalogStore } from '@renderer/state/catalogStore'
import { computeTieLineConflicts } from '@renderer/state/tieLineConflicts'
import { computeUsageCounts } from '@renderer/state/usageCounts'
import SetupSheetRow from './SetupSheetRow'

export default function SetupSheetTable(): JSX.Element {
  const items = useSetupStore((s) => s.items)
  const selectedItemIds = useSetupStore((s) => s.selectedItemIds)
  const selectItem = useSetupStore((s) => s.selectItem)
  const selectRangeTo = useSetupStore((s) => s.selectRangeTo)
  const toggleItem = useSetupStore((s) => s.toggleItem)
  const reorderItems = useSetupStore((s) => s.reorderItems)
  const updateItemFields = useSetupStore((s) => s.updateItemFields)
  const removeItem = useSetupStore((s) => s.removeItem)
  const unresolvedGearHints = useSetupStore((s) => s.unresolvedGearHints)
  const clearUnresolvedGearHint = useSetupStore((s) => s.clearUnresolvedGearHint)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    reorderItems(arrayMove(items, oldIndex, newIndex).map((item) => item.id))
  }

  function handleGutterClick(e: React.MouseEvent, itemId: number | string): void {
    if (e.shiftKey) selectRangeTo(itemId)
    else if (e.ctrlKey || e.metaKey) toggleItem(itemId)
    else selectItem(itemId)
  }

  const mics = useCatalogStore((s) => s.mics)
  const outboardGear = useCatalogStore((s) => s.outboardGear)
  const isTemporary = useCatalogStore((s) => s.isTemporary)

  const conflicts = computeTieLineConflicts(items)
  const micUsageCounts = computeUsageCounts(items, 'micId')
  const outboardUsageCounts = computeUsageCounts(items, 'outboardId')

  return (
    <div style={{ padding: 12 }}>
      <div className="section-title" style={{ marginTop: 0 }}>
        Setup Sheet
      </div>
      {items.length === 0 ? (
        <div className="empty-state">
          No sources yet — use Add Source above, or switch to Layout Mode to drag instruments onto the room layout.
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>Source Name</th>
              <th>Mic</th>
              <th>Outboard</th>
              <th>Channel</th>
              <th>Tie Line</th>
              <th>Cue Box</th>
              <th>Polarity</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <tbody>
                {items.map((item) => (
                  <SetupSheetRow
                    key={item.id}
                    item={item}
                    mics={mics}
                    outboardGear={outboardGear}
                    isTemporary={isTemporary}
                    selected={selectedItemIds.has(item.id)}
                    conflict={item.tieLine != null && conflicts.has(item.tieLine)}
                    unresolvedGearHint={unresolvedGearHints.get(item.id)}
                    onClearUnresolvedGearHint={(field) => clearUnresolvedGearHint(item.id, field)}
                    micUsageCounts={micUsageCounts}
                    outboardUsageCounts={outboardUsageCounts}
                    onGutterClick={(e) => handleGutterClick(e, item.id)}
                    onChange={(patch) => updateItemFields(item.id, patch)}
                    onDelete={() => removeItem(item.id)}
                  />
                ))}
              </tbody>
            </SortableContext>
          </DndContext>
        </table>
      )}
    </div>
  )
}
