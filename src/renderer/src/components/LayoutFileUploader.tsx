import { useEffect, useRef, useState } from 'react'
import type { RoomLayoutFile } from '@shared/types/entities'

interface Props {
  /** Null while a brand-new studio has not been written to the database yet. */
  studioId: number | null
  /** Creates the studio row on demand, for the null case above, and returns its id. Without one a
   *  null studioId simply disables the button. */
  ensureStudioId?: () => Promise<number | null>
  disabled?: boolean
  onUploaded?: (layout: RoomLayoutFile) => void
}

export default function LayoutFileUploader({
  studioId,
  ensureStudioId,
  disabled,
  onUploaded
}: Props): JSX.Element {
  const [layout, setLayout] = useState<RoomLayoutFile | null>(null)
  const [importing, setImporting] = useState(false)
  // An upload on a new studio creates the row mid-flight, so studioId changes from null to an id
  // while the file dialog is still open and re-runs the effect below. Its "nothing here yet" answer
  // must not be allowed to land after the import's result and blank the card.
  const importingRef = useRef(false)

  useEffect(() => {
    if (studioId == null) {
      setLayout(null)
      return
    }
    if (importingRef.current) return
    window.api.layoutFile.getForStudio(studioId).then(setLayout)
  }, [studioId])

  async function upload(): Promise<void> {
    setImporting(true)
    importingRef.current = true
    try {
      const id = studioId ?? (await ensureStudioId?.()) ?? null
      if (id == null) return
      const result = await window.api.layoutFile.importForStudio(id)
      if (result) {
        setLayout(result)
        onUploaded?.(result)
      }
    } finally {
      importingRef.current = false
      setImporting(false)
    }
  }

  return (
    <div>
      {layout ? (
        <div className="card">
          <div className="card-title">{layout.originalName ?? 'Room layout file'}</div>
          <div className="card-sub">
            Imported {new Date(layout.importedAt).toLocaleString()}
            {layout.pageWidthPt && layout.pageHeightPt
              ? ` — ${Math.round(layout.pageWidthPt)}×${Math.round(layout.pageHeightPt)} pt`
              : ''}
          </div>
        </div>
      ) : (
        <div className="empty-state">No room layout uploaded for this studio yet.</div>
      )}

      <div className="inline-form">
        <button className="btn primary" onClick={upload} disabled={importing || disabled}>
          {importing ? 'Importing…' : layout ? 'Replace Layout File' : 'Upload Layout File'}
        </button>
      </div>
    </div>
  )
}
