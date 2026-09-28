import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

/** The sensor set every sortable list in the app uses.
 *
 *  Extracted because all five drag surfaces had the same PointerSensor-only line copy-pasted, and
 *  none of them had a KeyboardSensor — so reordering setup-sheet rows, setup columns, gear lists
 *  and both palette lists was mouse-only. That is worth more than it sounds: dnd-kit's `attributes`
 *  already put role="button" and tabIndex={0} on every drag handle, so the handles have always
 *  taken focus and then done nothing at all when pressed.
 *
 *  A shared hook rather than five fixes so the next sortable list gets this without being asked —
 *  the copy-paste is how all five came to be missing it in the first place.
 *
 *  Registering the sensor also turns on dnd-kit's own screen-reader announcements ("Picked up
 *  sortable item 3. Sortable item 3 was moved to position 1 of 8."), which need no wiring here.
 *
 *  Space or Enter on a focused handle picks the item up, arrows move it, Space/Enter drops it, and
 *  Escape cancels. The 4px pointer activation distance is kept as it was: it stops a plain click on
 *  a handle from registering as a drag. */
export function useSortableSensors(): ReturnType<typeof useSensors> {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
}
