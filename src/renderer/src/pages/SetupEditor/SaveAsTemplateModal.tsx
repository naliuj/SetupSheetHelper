import { useState } from 'react'
import { useFolderPicker } from '@renderer/state/useFolderPicker'
import FolderPicker from '@renderer/components/FolderPicker'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

interface Props {
  onClose: () => void
  onSave: (name: string, folderId: number | null) => Promise<void>
}

export default function SaveAsTemplateModal({ onClose, onSave }: Props): JSX.Element {
  useEscapeToClose(onClose)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  // Templates live alongside custom studios in grid 1 ("New Setup From Studio Template"), so their
  // folders belong to the 'studio' namespace — not 'setup'.
  const { folders, selectedFolderId, setSelectedFolderId, createFolder } = useFolderPicker('studio')

  async function handleSave(): Promise<void> {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave(name.trim(), selectedFolderId)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <h2>Save as Studio</h2>
        <p className="card-sub">
          Saves this setup's gear list (no positions) as a reusable Custom Studio for this room.
        </p>
        <div className="inline-form" style={{ marginTop: 0 }}>
          <label htmlFor="template-studio-name" className="visually-hidden">
            Studio name
          </label>
          <input
            id="template-studio-name"
            placeholder="Studio name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
          />
        </div>
        {/* Stays a div rather than becoming a <label>: FolderPicker is a list of controls, not a
            single form element, so there is nothing for a label to point at. The caption names the
            group instead — and the group wrapper is what carries that, since passing
            aria-labelledby to the component would be silently dropped (it neither declares nor
            spreads it, and TypeScript does not excess-property-check hyphenated JSX attributes,
            so nothing would have complained). */}
        <div className="folder-picker-field-label" id="template-folder-label">
          Folder
        </div>
        <div role="group" aria-labelledby="template-folder-label">
          <FolderPicker
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelect={setSelectedFolderId}
            onCreateFolder={createFolder}
          />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save studio'}
          </button>
        </div>
      </div>
    </div>
  )
}
