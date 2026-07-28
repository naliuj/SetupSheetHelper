import { useEffect, useState } from 'react'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import Icon from '@renderer/components/Icon'

interface Props {
  studioId: number
  /** The setup the user has open — becomes the first member, and seeds the auto-name. */
  currentSetupName: string
  currentSessionDate: string | null
  onClose: () => void
  onCreate: (input: { name: string; sourceSetupName: string; newSetupNames: string[] }) => Promise<void>
}

/** One-step Multi Setup creation: names the group and every sibling setup at once, so the group is
 *  never created in the one-member state that removeSetupFromMultiSetup treats as meaningless.
 *
 *  Unlike every other "add" form in the app (which commits each row to the DB immediately), the
 *  rows here are staged locally and submitted together — deliberately kept local to this component
 *  rather than generalized, since it's the only place that needs it. */
export default function CreateMultiSetupModal({
  studioId,
  currentSetupName,
  currentSessionDate,
  onClose,
  onCreate
}: Props): JSX.Element {
  useEscapeToClose(onClose)
  const [name, setName] = useState('')
  const [sourceName, setSourceName] = useState(currentSetupName)
  const [newNames, setNewNames] = useState<string[]>([''])
  const [creating, setCreating] = useState(false)

  // Auto-name from the room and the session being prepped ("Studio 3 — 2026-07-19") — the two
  // things that identify a Multi Setup at a glance on the Home screen badge. Editable; only
  // pre-fills while the field is still untouched.
  useEffect(() => {
    window.api.studios.get(studioId).then((studio) => {
      if (!studio) return
      setName((current) => (current ? current : [studio.name, currentSessionDate].filter(Boolean).join(' — ')))
    })
  }, [studioId, currentSessionDate])

  function updateNewName(index: number, value: string): void {
    setNewNames((prev) => prev.map((n, i) => (i === index ? value : n)))
  }

  function removeNewName(index: number): void {
    setNewNames((prev) => prev.filter((_, i) => i !== index))
  }

  const filledNewNames = newNames.map((n) => n.trim()).filter(Boolean)
  // A Multi Setup of one setup is just a setup, so at least one sibling is required — this is what
  // structurally keeps the degenerate one-member group from ever being created.
  const canCreate = !!name.trim() && !!sourceName.trim() && filledNewNames.length > 0

  async function handleCreate(): Promise<void> {
    if (!canCreate) return
    setCreating(true)
    try {
      await onCreate({ name: name.trim(), sourceSetupName: sourceName.trim(), newSetupNames: filledNewNames })
      onClose()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
        <h2 style={{ marginTop: 0 }}>Add another setup</h2>

        <label className="card-sub" style={{ display: 'block', marginBottom: 4 }}>
          Multi Setup name
        </label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />

        <label className="card-sub" style={{ display: 'block', margin: '14px 0 4px' }}>
          Setups in this Multi Setup
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <input value={sourceName} onChange={(e) => setSourceName(e.target.value)} style={{ flex: 1 }} />
          <span className="card-sub" style={{ flexShrink: 0 }}>
            current
          </span>
        </div>
        {newNames.map((newName, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <input
              value={newName}
              placeholder="e.g. Band B"
              onChange={(e) => updateNewName(i, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              style={{ flex: 1 }}
              autoFocus={i === 0}
            />
            <button
              className="btn small"
              onClick={() => removeNewName(i)}
              disabled={newNames.length === 1}
              aria-label={`Remove setup ${i + 2}`}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
        <button className="link-button" style={{ marginTop: 2 }} onClick={() => setNewNames((prev) => [...prev, ''])}>
          + Add another
        </button>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleCreate} disabled={creating || !canCreate}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
