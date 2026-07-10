import { useState } from 'react'
import { useBerkleeFeaturesStore } from '@renderer/state/berkleeFeaturesStore'

/** Shown once, on first launch of a fresh database — deliberately has no backdrop-click or
 *  Escape dismissal, since it's a one-time forced choice rather than a cancelable dialog. */
export default function BerkleeOnboardingModal(): JSX.Element {
  const enable = useBerkleeFeaturesStore((s) => s.enable)
  const disable = useBerkleeFeaturesStore((s) => s.disable)
  const [working, setWorking] = useState(false)

  async function choose(action: () => Promise<void>): Promise<void> {
    setWorking(true)
    try {
      await action()
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 420 }}>
        <h2>Pre-load Berklee studios and gear?</h2>
        <p className="card-sub">
          Set up Setup Sheet Helper with Berklee College of Music&rsquo;s real buildings, studios, and gear lists —
          or start with a clean slate and add your own studios. You can change this later in Settings.
        </p>
        <div className="modal-actions">
          <button className="btn" disabled={working} onClick={() => choose(disable)}>
            No, start blank
          </button>
          <button className="btn primary" disabled={working} onClick={() => choose(enable)}>
            {working ? 'Loading…' : 'Yes, pre-load Berklee'}
          </button>
        </div>
      </div>
    </div>
  )
}
