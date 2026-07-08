import { useEffect, useState } from 'react'
import type { RoomLayoutPdf } from '@shared/types/entities'

export default function LayoutPdfUploader({ studioId }: { studioId: number }): JSX.Element {
  const [layout, setLayout] = useState<RoomLayoutPdf | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    window.api.layoutPdf.getForStudio(studioId).then(setLayout)
  }, [studioId])

  async function upload(): Promise<void> {
    setImporting(true)
    try {
      const result = await window.api.layoutPdf.importForStudio(studioId)
      if (result) setLayout(result)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      {layout ? (
        <div className="card">
          <div className="card-title">{layout.originalName ?? 'Room layout PDF'}</div>
          <div className="card-sub">
            Imported {new Date(layout.importedAt).toLocaleString()}
            {layout.pageWidthPt && layout.pageHeightPt
              ? ` — ${Math.round(layout.pageWidthPt)}×${Math.round(layout.pageHeightPt)} pt`
              : ''}
          </div>
        </div>
      ) : (
        <div className="empty-state">No room layout PDF uploaded for this studio yet.</div>
      )}

      <div className="inline-form">
        <button className="btn primary" onClick={upload} disabled={importing}>
          {importing ? 'Importing…' : layout ? 'Replace Layout PDF' : 'Upload Layout PDF'}
        </button>
      </div>
    </div>
  )
}
