import { useState } from 'react'
import { useSetupStoreApi } from '@renderer/state/setupStoreContext'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

interface Props {
  studioId: number
  setupId: number | null
  onResolved: () => void
  onCancel: () => void
}

type Step = 'choose' | 'scope'

/** Blocks entering Layout Mode until there's an effective layout for this setup (its own
 *  override, or the studio's shared file). Offers three ways to resolve that: upload a file (then
 *  choose whether it's saved to the studio or just this setup), continue with a blank sheet, or
 *  cancel. Proceeds into Layout Mode the moment any of those resolves (no extra confirmation
 *  click), matching the previous single-upload version's behavior. */
export default function RequireLayoutFileModal({ studioId, setupId, onResolved, onCancel }: Props): JSX.Element {
  const [step, setStep] = useState<Step>('choose')
  const [picked, setPicked] = useState<{ sourcePath: string; fileName: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setupStoreApi = useSetupStoreApi()

  useEscapeToClose(onCancel)

  // Brand-new, never-saved setups have no id yet — get one the same way save-as-template does,
  // since a per-setup layout override needs a real setup row to attach to.
  async function ensureSetupId(): Promise<number | null> {
    if (setupId) return setupId
    await setupStoreApi.getState().save()
    return setupStoreApi.getState().setupId
  }

  async function handlePickFile(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.layoutFile.pickFile()
      if (!result) return // OS dialog canceled — stay on this step, nothing changed
      setPicked(result)
      setStep('scope')
    } catch {
      setError('Could not open the file picker — please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleBlankSheet(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const id = await ensureSetupId()
      if (id == null) {
        setError('Could not save this setup — please try again.')
        return
      }
      await window.api.layoutFile.setBlankForSetup(id)
      onResolved()
    } catch {
      setError('Something went wrong — please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveToStudio(): Promise<void> {
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      await window.api.layoutFile.commitPickedToStudio(studioId, picked.sourcePath)
      onResolved()
    } catch {
      setError('Could not save this layout — please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleJustThisSetup(): Promise<void> {
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      const id = await ensureSetupId()
      if (id == null) {
        setError('Could not save this setup — please try again.')
        return
      }
      await window.api.layoutFile.commitPickedToSetup(id, picked.sourcePath)
      onResolved()
    } catch {
      setError('Could not save this layout — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        {step === 'choose' && (
          <>
            <h2 style={{ marginTop: 0 }}>Room layout needed</h2>
            <p className="card-sub" style={{ marginTop: 0 }}>
              This studio doesn't have a room layout yet — upload one, or continue with a blank sheet.
            </p>
            {error && (
              <p className="card-sub" style={{ color: 'var(--color-danger)' }}>
                {error}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <button className="btn primary" onClick={handlePickFile} disabled={busy}>
                {busy ? 'Opening…' : 'Upload a Room Layout…'}
              </button>
              <button className="btn" onClick={handleBlankSheet} disabled={busy}>
                {busy ? 'Please wait…' : 'Continue with a Blank Sheet'}
              </button>
              <button className="btn" onClick={onCancel} disabled={busy}>
                Cancel
              </button>
            </div>
          </>
        )}
        {step === 'scope' && picked && (
          <>
            <h2 style={{ marginTop: 0 }}>Save this layout?</h2>
            <p className="card-sub" style={{ marginTop: 0 }}>
              "{picked.fileName}" — save it to this studio so every setup here uses it, or keep it just for this
              setup.
            </p>
            {error && (
              <p className="card-sub" style={{ color: 'var(--color-danger)' }}>
                {error}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <button className="btn primary" onClick={handleSaveToStudio} disabled={busy}>
                {busy ? 'Saving…' : 'Save to Studio'}
              </button>
              <button className="btn" onClick={handleJustThisSetup} disabled={busy}>
                {busy ? 'Saving…' : 'Just This Setup'}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setStep('choose')
                  setPicked(null)
                  setError(null)
                }}
                disabled={busy}
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
