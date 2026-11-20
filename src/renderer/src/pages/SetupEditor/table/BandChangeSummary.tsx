import { useState } from 'react'
import type { SetupItemDraft } from '@shared/types/setup'
import { changeCount, type BandChanges } from '@shared/utils/bands'
import ChangeoverPanel from './ChangeoverPanel'

interface Props {
  bandIndex: number
  bandName: string
  changes: BandChanges<SetupItemDraft> | undefined
  previousName: string
}

/** "3 changes from Band 1, 1 removed" on a band's divider bar; opens the changeover panel. Nothing
 *  for the first band or a band that matches the one before it. */
export default function BandChangeSummary({ bandIndex, bandName, changes, previousName }: Props): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const count = changes ? changeCount(changes) : 0
  if (bandIndex === 0 || !changes || count === 0) return null
  const removed = changes.removed.length

  return (
    <>
      <button
        className="band-change-summary"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        aria-haspopup="dialog"
      >
        {count} change{count === 1 ? '' : 's'} from {previousName}
        {removed > 0 && `, ${removed} removed`}
      </button>
      {open && (
        <ChangeoverPanel bandIndex={bandIndex} bandName={bandName} changes={changes} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
