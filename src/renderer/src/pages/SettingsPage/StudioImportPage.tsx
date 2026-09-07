import { useEffect, useMemo, useState } from 'react'
import type { ExportedStudio, StudioExportFile } from '@shared/types/ipc'

interface Props {
  file: StudioExportFile
  onBack: () => void
  onDone: (imported: string[], skipped: string[]) => void
}

/** Every studio in the file gets a line here, including a one-studio file: this page is where a
 *  studio you already have gets flagged, and re-importing a downloaded pack is exactly the
 *  one-studio case that would otherwise duplicate without a word. */
export default function StudioImportPage({ file, onBack, onDone }: Props): JSX.Element {
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set())
  // Duplicates are imported under a suffixed name rather than merged into the studio you have —
  // importStudios only ever creates, and overwriting would destroy local edits to that room.
  const [copyIndexes, setCopyIndexes] = useState<Set<number>>(new Set())
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set())
  // Distinct from "existingNames is empty" — a user with no custom studios also has an empty set,
  // and the default selection must wait for the real answer either way.
  const [namesLoaded, setNamesLoaded] = useState(false)
  const [seeded, setSeeded] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.studios.listCustom().then((studios) => {
      setExistingNames(new Set(studios.map((s) => s.name.trim().toLowerCase())))
      setNamesLoaded(true)
    })
  }, [])

  const isDuplicate = useMemo(
    () => file.studios.map((studio) => existingNames.has(studio.name.trim().toLowerCase())),
    [file.studios, existingNames]
  )

  // Importing everything is the common case, so start with it all ticked rather than making the
  // user reach for Select all. Duplicates stay off: the flag exists to make re-importing something
  // you already have a deliberate act, and pre-ticking it would undo that.
  //
  // Seeded once, and only after listCustom resolves — duplicates are unknown before that, and
  // re-running would wipe out whatever the user has since ticked.
  useEffect(() => {
    if (seeded || !namesLoaded) return
    setSelectedIndexes(new Set(file.studios.map((_, index) => index).filter((index) => !isDuplicate[index])))
    setSeeded(true)
  }, [seeded, namesLoaded, file.studios, isDuplicate])

  function toggle(index: number): void {
    setSelectedIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleCopy(index: number): void {
    setCopyIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
    setSelectedIndexes((prev) => new Set(prev).add(index))
  }

  /** "Studio A" alongside an existing "Studio A" becomes "Studio A (2)", counting up past any
   *  copies already made. Studio names are not unique in the schema, so this is for the human
   *  reading the sidebar, not a constraint. */
  function copyName(name: string, taken: Set<string>): string {
    let n = 2
    while (taken.has(`${name} (${n})`.trim().toLowerCase())) n++
    const chosen = `${name} (${n})`
    taken.add(chosen.trim().toLowerCase())
    return chosen
  }

  async function handleImport(): Promise<void> {
    setImporting(true)
    setError(null)
    try {
      // Seeded with what's already in the sidebar and added to as we go, so importing the same
      // duplicate twice in one pass yields (2) and (3) rather than (2) twice.
      const taken = new Set(existingNames)
      const chosen: ExportedStudio[] = []
      for (const [index, studio] of file.studios.entries()) {
        if (!selectedIndexes.has(index)) continue
        chosen.push(copyIndexes.has(index) ? { ...studio, name: copyName(studio.name, taken) } : studio)
      }
      const result = await window.api.studios.importStudios(chosen)
      const skipped = file.studios
        .filter((_, index) => isDuplicate[index] && !selectedIndexes.has(index))
        .map((studio) => studio.name)
      onDone(result.imported, skipped)
    } catch {
      // Previously a try/finally with no catch, so a failed write left the page silent.
      setError('Could not import from that file. Nothing was changed.')
    } finally {
      setImporting(false)
    }
  }

  const selectedCount = selectedIndexes.size

  return (
    <div className="page">
      <div className="nav-crumbs">
        <button onClick={onBack}>Settings</button> / Import studios
      </div>

      <h2 style={{ margin: '8px 0 4px' }}>Import studios</h2>
      <p className="card-sub" style={{ marginBottom: 14 }}>
        {file.studios.length} studio{file.studios.length === 1 ? '' : 's'} in this file
      </p>

      <div className="inline-form" style={{ marginTop: 0, alignItems: 'center' }}>
        <button className="btn small" onClick={() => setSelectedIndexes(new Set(file.studios.map((_, i) => i)))}>
          Select all
        </button>
        <button
          className="btn small"
          onClick={() => {
            setSelectedIndexes(new Set())
            setCopyIndexes(new Set())
          }}
        >
          Deselect all
        </button>
        <span className="card-sub" style={{ marginLeft: 'auto' }}>
          {selectedCount} of {file.studios.length} selected
        </span>
      </div>

      <div className="panel" style={{ maxHeight: 360, overflow: 'auto', marginTop: 8, padding: 8 }}>
        {file.studios.map((studio, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '9px 8px',
              borderBottom: index === file.studios.length - 1 ? 'none' : '1px solid var(--color-border)'
            }}
          >
            <input
              type="checkbox"
              style={{ marginTop: 2 }}
              checked={selectedIndexes.has(index)}
              onChange={() => toggle(index)}
              aria-label={`Import ${studio.name}`}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontWeight: 600 }}>
                {studio.name}
                {isDuplicate[index] && <span className="warning-badge">Already imported</span>}
              </div>
              <div className="card-sub" style={{ marginTop: 2 }}>
                {studio.mics.length} mics · {studio.outboardGear.length} outboard ·{' '}
                {studio.preamps.length} preamp{studio.preamps.length === 1 ? '' : 's'} ·{' '}
                {studio.roomLayoutFile ? 'room layout' : 'no room layout'}
              </div>
              {isDuplicate[index] && (
                <div className="inline-form" style={{ marginTop: 7, alignItems: 'center' }}>
                  <button className="btn small" onClick={() => toggleCopy(index)}>
                    {copyIndexes.has(index) ? 'Importing as a copy' : 'Import as a copy'}
                  </button>
                  <span className="card-sub">or leave it unticked to skip</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="card-sub" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      <div className="modal-actions">
        <button className="btn" onClick={onBack}>
          Back
        </button>
        <button className="btn primary" onClick={handleImport} disabled={importing || selectedCount === 0}>
          {importing ? 'Importing…' : `Import ${selectedCount} studio${selectedCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}
