import { useEffect, useRef, useState } from 'react'
import { LAYOUT_FILE_FORMATS_HINT } from '@shared/constants/roomLayout'
import { parseDbTimestamp } from '@shared/utils/dbTimestamp'

/** What the card shows about an uploaded file — common to room layouts and patchbays. */
interface UploadedFile {
  originalName: string | null
  importedAt: string
  pageWidthPt: number | null
  pageHeightPt: number | null
}

/** The two per-studio drawings this uploader handles. */
const KINDS = {
  layout: {
    get: (studioId: number): Promise<UploadedFile | null> => window.api.layoutFile.getForStudio(studioId),
    upload: (studioId: number): Promise<UploadedFile | null> => window.api.layoutFile.importForStudio(studioId),
    fallbackName: 'Room layout file',
    empty: 'No room layout uploaded for this studio yet.',
    uploadLabel: 'Upload Layout File',
    replaceLabel: 'Replace Layout File',
    hint: LAYOUT_FILE_FORMATS_HINT
  },
  patchbay: {
    get: async (studioId: number): Promise<UploadedFile | null> =>
      (await window.api.patchbay.getForStudio(studioId))?.file ?? null,
    upload: (studioId: number): Promise<UploadedFile | null> => window.api.patchbay.importForStudio(studioId),
    fallbackName: 'Patchbay drawing',
    empty: 'No patchbay uploaded for this studio yet.',
    uploadLabel: 'Upload Patchbay PDF',
    replaceLabel: 'Replace Patchbay PDF',
    hint: 'A PDF of the patchbay drawing. Cables snap to the jack labels it can read.'
  }
} as const

interface Props {
  /** Which of the studio's drawings this manages. */
  kind?: keyof typeof KINDS
  /** Null while a brand-new studio has not been written to the database yet. */
  studioId: number | null
  /** Creates the studio row on demand, for the null case above, and returns its id. Without one a
   *  null studioId simply disables the button. */
  ensureStudioId?: () => Promise<number | null>
  disabled?: boolean
}

/** A studio's room layout or patchbay drawing: what's uploaded, and a button to upload or replace
 *  it. */
export default function LayoutFileUploader({
  kind = 'layout',
  studioId,
  ensureStudioId,
  disabled
}: Props): JSX.Element {
  const config = KINDS[kind]
  const [layout, setLayout] = useState<UploadedFile | null>(null)
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
    config.get(studioId).then(setLayout)
  }, [studioId, config])

  async function upload(): Promise<void> {
    setImporting(true)
    importingRef.current = true
    try {
      const id = studioId ?? (await ensureStudioId?.()) ?? null
      if (id == null) return
      const result = await config.upload(id)
      if (result) setLayout(result)
    } finally {
      importingRef.current = false
      setImporting(false)
    }
  }

  return (
    <div>
      {layout ? (
        <div className="card">
          <div className="card-title">{layout.originalName ?? config.fallbackName}</div>
          <div className="card-sub">
            Imported {parseDbTimestamp(layout.importedAt).toLocaleString()}
            {layout.pageWidthPt && layout.pageHeightPt
              ? ` — ${Math.round(layout.pageWidthPt)}×${Math.round(layout.pageHeightPt)} pt`
              : ''}
          </div>
        </div>
      ) : (
        <div className="empty-state">{config.empty}</div>
      )}

      <div className="inline-form">
        <button className="btn primary" onClick={upload} disabled={importing || disabled}>
          {importing ? 'Importing…' : layout ? config.replaceLabel : config.uploadLabel}
        </button>
      </div>
      <p className="card-sub" style={{ marginTop: 6 }}>
        {config.hint}
      </p>
    </div>
  )
}
