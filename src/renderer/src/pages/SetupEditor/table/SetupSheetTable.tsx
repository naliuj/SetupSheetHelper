import { useMemo } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useSetupStore } from '@renderer/state/setupStore'
import { useCatalogStore } from '@renderer/state/catalogStore'
import { useGearCatalogueSuggestions } from '@renderer/state/useGearCatalogueSuggestions'
import { computeTieLineConflicts } from '@renderer/state/tieLineConflicts'
import { computeUsageCounts, computeOutboardUsageCounts } from '@renderer/state/usageCounts'
import SetupSheetRow from './SetupSheetRow'

function toLabels(items: { name: string; manufacturer: string | null }[]): string[] {
  const set = new Set<string>()
  for (const item of items) set.add(item.manufacturer ? `${item.manufacturer} ${item.name}` : item.name)
  return [...set].sort((a, b) => a.localeCompare(b))
}

export default function SetupSheetTable(): JSX.Element {
  const items = useSetupStore((s) => s.items)
  const outboardColumnCount = useSetupStore((s) => s.outboardColumnCount)
  const updateItemOutboardSlot = useSetupStore((s) => s.updateItemOutboardSlot)
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
  const preamps = useCatalogStore((s) => s.preamps)
  const isTemporary = useCatalogStore((s) => s.isTemporary)

  // Quick Setup's free-text mic/outboard/preamp fields have no studio catalogue to pick
  // from, so they get autocomplete suggestions from every known model across every studio
  // instead — same source data Personal Gear/Faculty Reserve/Session Gear's forms use.
  const gearSuggestions = useGearCatalogueSuggestions()
  const micSuggestions = useMemo(() => toLabels(gearSuggestions.mics), [gearSuggestions.mics])
  const outboardSuggestions = useMemo(() => toLabels(gearSuggestions.outboard), [gearSuggestions.outboard])
  const preampSuggestions = useMemo(() => toLabels(gearSuggestions.preamps), [gearSuggestions.preamps])

  const conflicts = computeTieLineConflicts(items)
  const micUsageCounts = computeUsageCounts(items, 'micId')
  const outboardUsageCounts = computeOutboardUsageCounts(items)
  const preampUsageCounts = computeUsageCounts(items, 'preampId')

  return (
    <div style={{ padding: 12 }}>
      <div className="section-title" style={{ marginTop: 0 }}>
        Setup sheet
      </div>
      {items.length === 0 ? (
        <div className="empty-state">
          No sources yet — use Add source above, or switch to Layout Mode to drag instruments onto the room layout.
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Source name</th>
                <th>Mic</th>
                {Array.from({ length: outboardColumnCount }, (_, i) => (
                  <th key={i}>{i === 0 ? 'Outboard' : `Outboard ${i + 1}`}</th>
                ))}
                <th>Channel</th>
                <th>Preamp</th>
                <th>Tie line</th>
                <th>Cue box</th>
                <th>Polarity</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <tbody>
                {items.map((item) => (
                  <SetupSheetRow
                    key={item.id}
                    item={item}
                    mics={mics}
                    outboardGear={outboardGear}
                    preamps={preamps}
                    outboardColumnCount={outboardColumnCount}
                    isTemporary={isTemporary}
                    micSuggestions={micSuggestions}
                    outboardSuggestions={outboardSuggestions}
                    preampSuggestions={preampSuggestions}
                    selected={selectedItemIds.has(item.id)}
                    conflict={item.tieLine != null && conflicts.has(item.tieLine)}
                    unresolvedGearHint={unresolvedGearHints.get(item.id)}
                    onClearUnresolvedGearHint={(field) => clearUnresolvedGearHint(item.id, field)}
                    micUsageCounts={micUsageCounts}
                    outboardUsageCounts={outboardUsageCounts}
                    preampUsageCounts={preampUsageCounts}
                    onGutterClick={(e) => handleGutterClick(e, item.id)}
                    onChange={(patch) => updateItemFields(item.id, patch)}
                    onOutboardSlotChange={(slotIndex, patch) => updateItemOutboardSlot(item.id, slotIndex, patch)}
                    onDelete={() => removeItem(item.id)}
                  />
                ))}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>
      )}
    </div>
  )
}
