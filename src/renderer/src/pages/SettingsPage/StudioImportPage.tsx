import { useState } from 'react'
import type { StudioExportFile } from '@shared/types/ipc'

interface Props {
  file: StudioExportFile
  onBack: () => void
  onDone: () => void
}

/** Shown only when an import file contains more than one studio — the user picks which to bring in. */
export default function StudioImportPage({ file, onBack, onDone }: Props): JSX.Element {
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function toggle(index: number): void {
    setSelectedIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function handleImport(): Promise<void> {
    setImporting(true)
    setMessage(null)
    try {
      const studios = file.studios.filter((_, index) => selectedIndexes.has(index))
      await window.api.studios.importStudios(studios)
      setMessage(`Imported ${studios.length} studio${studios.length === 1 ? '' : 's'}.`)
      setTimeout(onDone, 800)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <div className="nav-crumbs">
        <button onClick={onBack}>Settings</button> / Import Studios
      </div>
      <div className="inline-form" style={{ marginTop: 0 }}>
        <button className="btn small" onClick={() => setSelectedIndexes(new Set(file.studios.map((_, i) => i)))}>
          Select All
        </button>
        <button className="btn small" onClick={() => setSelectedIndexes(new Set())}>
          Deselect All
        </button>
      </div>
      <div className="panel" style={{ maxHeight: 320, overflow: 'auto' }}>
        {file.studios.map((studio, index) => (
          <label key={index} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
            <input type="checkbox" checked={selectedIndexes.has(index)} onChange={() => toggle(index)} />
            {studio.name}
            <span className="card-sub">
              ({studio.mics.length} mics, {studio.outboardGear.length} outboard)
            </span>
          </label>
        ))}
      </div>
      {message && <p className="card-sub">{message}</p>}
      <div className="modal-actions">
        <button className="btn primary" onClick={handleImport} disabled={importing || selectedIndexes.size === 0}>
          {importing ? 'Importing…' : 'Import Selected'}
        </button>
      </div>
    </div>
  )
}
