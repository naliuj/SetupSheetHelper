import { useEffect, useState } from 'react'
import type { RoomLayoutFile } from '@shared/types/entities'

interface Props {
  studioId: number
  onUploaded?: (layout: RoomLayoutFile) => void
}

export default function LayoutFileUploader({ studioId, onUploaded }: Props): JSX.Element {
  const [layout, setLayout] = useState<RoomLayoutFile | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    window.api.layoutFile.getForStudio(studioId).then(setLayout)
  }, [studioId])

  async function upload(): Promise<void> {
    setImporting(true)
    try {
      const result = await window.api.layoutFile.importForStudio(studioId)
      if (result) {
        setLayout(result)
        onUploaded?.(result)
      }
    } finally {
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
        <button className="btn primary" onClick={upload} disabled={importing}>
          {importing ? 'Importing…' : layout ? 'Replace Layout File' : 'Upload Layout File'}
        </button>
      </div>
    </div>
  )
}
