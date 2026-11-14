import { useState } from 'react'
import EntryRow from '@renderer/components/home/EntryRow'
import type { HomeEntry } from '@renderer/components/home/HomeSection'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import { useModalDialog } from '@renderer/hooks/useModalDialog'

export interface StudioPickerGroup {
  label: string
  entries: HomeEntry[]
}

/** The home screen's "+ New setup" button: every place a setup can start from in one searchable
 *  list. Picking a row runs that entry's own onActivate, the same as clicking it on the home. */
export default function StudioPickerModal({
  recent,
  groups,
  onClose
}: {
  recent: HomeEntry[]
  groups: StudioPickerGroup[]
  onClose: () => void
}): JSX.Element {
  useEscapeToClose(onClose)
  const dialog = useModalDialog('Choose a studio')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  // Recent repeats rows from the groups below, so it hides while searching.
  const shown = (q ? groups : [{ label: 'Recent', entries: recent }, ...groups])
    .map((g) => ({ ...g, entries: g.entries.filter((e) => e.label.toLowerCase().includes(q)) }))
    .filter((g) => g.entries.length > 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" {...dialog} onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <h2>Choose a studio</h2>
        <div className="inline-form" style={{ marginTop: 0 }}>
          <input
            placeholder="Search studios"
            aria-label="Search studios"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div className="studio-picker-list">
          {shown.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <div className="studio-picker-group">{g.label}</div>
              {g.entries.map((e) => (
                <EntryRow
                  key={e.id}
                  entry={{
                    ...e,
                    secondaryAction: undefined,
                    onActivate: () => {
                      onClose()
                      e.onActivate()
                    }
                  }}
                />
              ))}
            </div>
          ))}
          {shown.length === 0 && <div className="card-sub">No studios match &ldquo;{query.trim()}&rdquo;.</div>}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
