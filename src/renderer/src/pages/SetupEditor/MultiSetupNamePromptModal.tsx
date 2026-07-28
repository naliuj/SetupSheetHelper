import { useState } from 'react'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

interface Props {
  heading: string
  confirmLabel: string
  initialValue?: string
  onClose: () => void
  onSubmit: (name: string) => Promise<void> | void
}

/** Shared name-entry dialog for every Multi Setup naming moment — creating a group, adding a new
 *  band, renaming a group — same minimal input + Cancel/primary shape as ManageItemsModal's inline
 *  folder create/rename dialog. */
export default function MultiSetupNamePromptModal({
  heading,
  confirmLabel,
  initialValue = '',
  onClose,
  onSubmit
}: Props): JSX.Element {
  useEscapeToClose(onClose)
  const [name, setName] = useState(initialValue)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(): Promise<void> {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      await onSubmit(name.trim())
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 360 }}>
        <h2 style={{ marginTop: 0 }}>{heading}</h2>
        <div className="inline-form" style={{ marginTop: 0 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoFocus
            onFocus={(e) => e.target.select()}
          />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
