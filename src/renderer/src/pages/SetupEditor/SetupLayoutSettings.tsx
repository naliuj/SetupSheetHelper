import { useCallback, useEffect, useState } from 'react'
import type { RoomLayoutFile, SetupLayoutOverride } from '@shared/types/entities'
import { LAYOUT_FILE_FORMATS_HINT } from '@shared/constants/roomLayout'
import { parseDbTimestamp } from '@shared/utils/dbTimestamp'

interface Props {
  setupId: number
  studioId: number
}

/** Setup Settings → Room layout: which floor plan this setup draws on, and the ways to change it
 *  after the first choice made in the "Room layout needed" dialog — its own file, a blank sheet,
 *  or back to the studio's shared layout. The studio's own layout is changed in the studio
 *  editor, since that reaches every setup in the studio. */
export default function SetupLayoutSettings({ setupId, studioId }: Props): JSX.Element {
  const [override, setOverride] = useState<SetupLayoutOverride | null>(null)
  const [studioFile, setStudioFile] = useState<RoomLayoutFile | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [own, studio] = await Promise.all([
      window.api.layoutFile.getOverrideForSetup(setupId),
      window.api.layoutFile.getForStudio(studioId)
    ])
    setOverride(own)
    setStudioFile(studio)
    setLoaded(true)
  }, [setupId, studioId])

  useEffect(() => {
    void load()
    // A change made elsewhere (the studio editor, the pop-out window) shows here too.
    return window.api.layoutFile.onChanged(() => void load())
  }, [load])

  async function run(change: () => Promise<unknown>, failure: string): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await change()
      await load()
    } catch {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(): Promise<void> {
    await run(async () => {
      const picked = await window.api.layoutFile.pickFile()
      if (picked) await window.api.layoutFile.commitPickedToSetup(setupId, picked.sourcePath)
    }, 'Could not use that file. Please try again.')
  }

  if (!loaded) return <p className="card-sub">Loading…</p>

  let current: JSX.Element
  if (override?.kind === 'file') {
    current = (
      <>
        <div className="card-title">{override.originalName ?? 'Room layout file'}</div>
        <div className="card-sub">
          This setup&rsquo;s own layout, imported {parseDbTimestamp(override.importedAt).toLocaleString()}
        </div>
      </>
    )
  } else if (override?.kind === 'blank') {
    current = (
      <>
        <div className="card-title">Blank sheet</div>
        <div className="card-sub">This setup draws on a blank Letter page.</div>
      </>
    )
  } else if (studioFile) {
    current = (
      <>
        <div className="card-title">{studioFile.originalName ?? 'Room layout file'}</div>
        <div className="card-sub">The studio&rsquo;s layout, shared by its setups</div>
      </>
    )
  } else {
    current = (
      <>
        <div className="card-title">No room layout yet</div>
        <div className="card-sub">Layout Mode will ask for one the next time you open it.</div>
      </>
    )
  }

  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>
        Room layout
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        {current}
      </div>
      {error && (
        <p className="card-sub" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button className="btn" disabled={busy} onClick={() => void handleUpload()}>
          {override?.kind === 'file' ? 'Replace this setup’s layout…' : 'Upload a layout for this setup…'}
        </button>
        {override?.kind !== 'blank' && (
          <button
            className="btn"
            disabled={busy}
            onClick={() => void run(() => window.api.layoutFile.setBlankForSetup(setupId), 'Could not switch to a blank sheet. Please try again.')}
          >
            Use a blank sheet
          </button>
        )}
        {override && studioFile && (
          <button
            className="btn"
            disabled={busy}
            onClick={() => void run(() => window.api.layoutFile.clearOverrideForSetup(setupId), 'Could not switch back. Please try again.')}
          >
            Use the studio&rsquo;s layout
          </button>
        )}
        {override && !studioFile && (
          <button
            className="btn"
            disabled={busy}
            onClick={() => void run(() => window.api.layoutFile.clearOverrideForSetup(setupId), 'Could not remove the layout. Please try again.')}
          >
            Remove this setup&rsquo;s layout
          </button>
        )}
      </div>
      <p className="card-sub">{LAYOUT_FILE_FORMATS_HINT}</p>
      <p className="card-sub">
        Blocks, notes and markup stay where they are when the layout changes, so check them against the new floor plan.
        To change the layout every setup in this studio uses, edit the studio.
      </p>
    </div>
  )
}
