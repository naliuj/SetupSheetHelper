import { useState } from 'react'
import { useFolderPicker } from '@renderer/state/useFolderPicker'
import FolderPickerFields from '@renderer/components/FolderPickerFields'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

interface Props {
  onClose: () => void
  onSave: (name: string, folderId: number | null) => Promise<void>
}

export default function SaveAsTemplateModal({ onClose, onSave }: Props): JSX.Element {
  useEscapeToClose(onClose)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const { folderOptions, selection, setSelection, newFolderName, setNewFolderName, resolveFolderId } =
    useFolderPicker()

  async function handleSave(): Promise<void> {
    if (!name.trim()) return
    setSaving(true)
    try {
      const folderId = await resolveFolderId()
      await onSave(name.trim(), folderId)
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
          <input
            placeholder="Studio name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !newFolderName && handleSave()}
            autoFocus
          />
        </div>
        <FolderPickerFields
          folderOptions={folderOptions}
          selection={selection}
          onChangeSelection={setSelection}
          newFolderName={newFolderName}
          onChangeNewFolderName={setNewFolderName}
        />
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
