import { useState } from 'react'
import { useFolderPicker } from '@renderer/state/useFolderPicker'
import FolderPicker from '@renderer/components/FolderPicker'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

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
  useEscapeToClose(onClose)
  const [name, setName] = useState('')
  const [sessionDate, setSessionDate] = useState(today())
  const [engineer, setEngineer] = useState('')
  const [artist, setArtist] = useState('')
  const [creating, setCreating] = useState(false)
  const { folders, selectedFolderId, setSelectedFolderId, createFolder } = useFolderPicker('setup')

  async function handleCreate(): Promise<void> {
    if (!name.trim()) return
    setCreating(true)
    try {
      await onCreate({
        name: name.trim(),
        sessionDate: sessionDate || null,
        engineer: engineer.trim() || null,
        artist: artist.trim() || null,
        folderId: selectedFolderId
      })
      onClose()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <h2>New setup</h2>
        <div className="inline-form" style={{ marginTop: 0 }}>
          <input
            placeholder="Setup name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
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
        <div className="folder-picker-field-label">Folder</div>
        <FolderPicker
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelect={setSelectedFolderId}
          onCreateFolder={createFolder}
        />
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? 'Creating…' : 'Create setup'}
          </button>
        </div>
      </div>
    </div>
  )
}
