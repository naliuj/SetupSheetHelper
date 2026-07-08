import { useState } from 'react'
import { useFolderPicker } from '@renderer/state/useFolderPicker'
import FolderPickerFields from '@renderer/components/FolderPickerFields'

export interface NewSetupDetails {
  name: string
  sessionDate: string | null
  engineer: string | null
  artist: string | null
  folderId: number | null
}

interface Props {
  onClose: () => void
  onCreate: (details: NewSetupDetails) => Promise<void>
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function NewSetupModal({ onClose, onCreate }: Props): JSX.Element {
  const [name, setName] = useState('')
  const [sessionDate, setSessionDate] = useState(today())
  const [engineer, setEngineer] = useState('')
  const [artist, setArtist] = useState('')
  const [creating, setCreating] = useState(false)
  const { folderOptions, selection, setSelection, newFolderName, setNewFolderName, resolveFolderId } =
    useFolderPicker()

  async function handleCreate(): Promise<void> {
    if (!name.trim()) return
    setCreating(true)
    try {
      const folderId = await resolveFolderId()
      await onCreate({
        name: name.trim(),
        sessionDate: sessionDate || null,
        engineer: engineer.trim() || null,
        artist: artist.trim() || null,
        folderId
      })
      onClose()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <h2>New Setup</h2>
        <div className="inline-form" style={{ marginTop: 0 }}>
          <input
            placeholder="Setup name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !newFolderName && handleCreate()}
            autoFocus
          />
        </div>
        <div className="inline-form">
          <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
        </div>
        <div className="inline-form">
          <input placeholder="Engineer (optional)" value={engineer} onChange={(e) => setEngineer(e.target.value)} />
        </div>
        <div className="inline-form">
          <input placeholder="Artist (optional)" value={artist} onChange={(e) => setArtist(e.target.value)} />
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
          <button className="btn primary" onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? 'Creating…' : 'Create Setup'}
          </button>
        </div>
      </div>
    </div>
  )
}
