import { useEffect, useMemo, useState } from 'react'
import type { LibraryStudio, StudioExportFile } from '@shared/types/ipc'

interface Props {
  onBack: () => void
  /** Hands the downloaded packs to the normal import screen, which owns confirmation, duplicate
   *  handling and the actual import. This page never imports anything itself. */
  onDownloaded: (file: StudioExportFile) => void
}

/** Model names are spelled with punctuation nobody types back ("SM-57" searched as "sm57"), so
 *  compare a stripped copy of both sides as well as the raw one. Same approach the website's own
 *  archive had to take against the same data. */
const strip = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, '')

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Browses the studios published on the companion site. The renderer cannot reach the site itself
 *  (CSP is `connect-src 'self'`), so both the index and the packs come over IPC from main. */
export default function StudioLibraryPage({ onBack, onDownloaded }: Props): JSX.Element {
  const [studios, setStudios] = useState<LibraryStudio[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    window.api.studioLibrary.fetchIndex().then((result) => {
      if (result.ok) setStudios(result.studios)
      else setError(result.error)
    })
    window.api.studios
      .listCustom()
      .then((mine) => setExistingNames(new Set(mine.map((s) => s.name.trim().toLowerCase()))))
  }, [])

  const shown = useMemo(() => {
    if (!studios) return []
    const q = query.trim().toLowerCase()
    if (!q) return studios
    return studios.filter((s) => {
      const haystack = `${s.name} ${s.city} ${s.note} ${s.gear}`.toLowerCase()
      return haystack.includes(q) || strip(haystack).includes(strip(q))
    })
  }, [studios, query])

  const byCity = useMemo(() => {
    const map = new Map<string, LibraryStudio[]>()
    for (const studio of shown) {
      const list = map.get(studio.city) ?? []
      list.push(studio)
      map.set(studio.city, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [shown])

  function toggle(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleDownload(): Promise<void> {
    if (!studios) return
    const picked = studios.filter((s) => selectedIds.has(s.id))
    if (picked.length === 0) return
    setDownloading(true)
    setError(null)
    try {
      const result = await window.api.studioLibrary.fetchPacks(picked.map((s) => s.file))
      if (result.ok) onDownloaded(result.file)
      else setError(result.error)
    } finally {
      setDownloading(false)
    }
  }

  const selectedCount = selectedIds.size
  const selectedBytes = (studios ?? []).filter((s) => selectedIds.has(s.id)).reduce((sum, s) => sum + s.bytes, 0)

  return (
    <div className="page">
      <div className="nav-crumbs">
        <button onClick={onBack}>Settings</button> / Browse studios
      </div>

      <h2 style={{ margin: '8px 0 4px' }}>Browse studios</h2>
      <p className="card-sub" style={{ marginBottom: 14, maxWidth: '80ch' }}>
        Rooms other engineers have shared. Downloading one brings its mic locker, outboard rack,
        preamps and floor plan straight in, the same as importing a file.
      </p>

      {error && (
        <p className="card-sub" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      {studios === null && !error && <div className="empty-state">Loading studios…</div>}

      {studios !== null && (
        <>
          <input
            className="field-input"
            type="search"
            placeholder="Search studios, cities, or gear"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: '100%', maxWidth: 420 }}
          />

          <div className="panel" style={{ maxHeight: 360, overflow: 'auto', marginTop: 12, padding: 8 }}>
            {shown.length === 0 ? (
              <div className="empty-state">No studios match that.</div>
            ) : (
              byCity.map(([city, list]) => (
                <div key={city}>
                  <div className="section-title" style={{ marginTop: 8 }}>
                    {city}
                  </div>
                  {list.map((studio) => {
                    const already = existingNames.has(studio.name.trim().toLowerCase())
                    return (
                      <div
                        key={studio.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: '9px 8px',
                          borderBottom: '1px solid var(--color-border)'
                        }}
                      >
                        <input
                          type="checkbox"
                          style={{ marginTop: 2 }}
                          checked={selectedIds.has(studio.id)}
                          onChange={() => toggle(studio.id)}
                          aria-label={`Select ${studio.name}`}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontWeight: 600 }}
                          >
                            {studio.name}
                            {already && <span className="warning-badge">Already imported</span>}
                          </div>
                          <div className="card-sub" style={{ marginTop: 2 }}>
                            {studio.counts.mics} mics · {studio.counts.outboard} outboard ·{' '}
                            {studio.counts.preamps} preamp{studio.counts.preamps === 1 ? '' : 's'} ·{' '}
                            {studio.roomLayout ? 'room layout' : 'no room layout'} · {formatSize(studio.bytes)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          <div className="modal-actions" style={{ alignItems: 'center' }}>
            <span className="card-sub" style={{ marginRight: 'auto' }}>
              {selectedCount > 0
                ? `${selectedCount} selected, ${formatSize(selectedBytes)} to download`
                : 'Nothing selected'}
            </span>
            <button className="btn" onClick={onBack}>
              Back
            </button>
            <button className="btn primary" onClick={handleDownload} disabled={downloading || selectedCount === 0}>
              {downloading ? 'Downloading…' : `Download ${selectedCount || ''}`.trim()}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
