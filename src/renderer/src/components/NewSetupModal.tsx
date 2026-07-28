import { useState } from 'react'
import { useFolderPicker } from '@renderer/state/useFolderPicker'
import { useBerkleeFeaturesStore } from '@renderer/state/berkleeFeaturesStore'
import FolderPicker from '@renderer/components/FolderPicker'
import ToggleSwitch from '@renderer/components/ToggleSwitch'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

export interface NewSetupDetails {
  name: string
  sessionDate: string | null
  engineer: string | null
  artist: string | null
  folderId: number | null
  facultyReserveEnabled: boolean
}

interface Props {
  /** Seeds every field from an existing setup — used by the "Duplicate" flow in Manage Setups so
   *  this same dialog doubles as the rename prompt for a copy, instead of a separate one. Omitted
   *  fields fall back to the blank-new-setup defaults. */
  initialName?: string
  initialSessionDate?: string | null
  initialEngineer?: string | null
  initialArtist?: string | null
  initialFolderId?: number | null
  initialFacultyReserveEnabled?: boolean
  heading?: string
  confirmLabel?: string
  onClose: () => void
  onCreate: (details: NewSetupDetails) => Promise<void>
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function NewSetupModal({
  initialName = '',
  initialSessionDate,
  initialEngineer = '',
  initialArtist = '',
  initialFolderId = null,
  initialFacultyReserveEnabled = false,
  heading = 'New setup',
  confirmLabel = 'Create setup',
  onClose,
  onCreate
}: Props): JSX.Element {
  useEscapeToClose(onClose)
  const [name, setName] = useState(initialName)
  const [sessionDate, setSessionDate] = useState(initialSessionDate ?? today())
  const [engineer, setEngineer] = useState(initialEngineer ?? '')
  const [artist, setArtist] = useState(initialArtist ?? '')
  const [facultyReserveEnabled, setFacultyReserveEnabled] = useState(initialFacultyReserveEnabled)
  const [creating, setCreating] = useState(false)
  const { folders, selectedFolderId, setSelectedFolderId, createFolder } = useFolderPicker('setup', initialFolderId)
  const berkleeFeaturesEnabled = useBerkleeFeaturesStore((s) => s.enabled)

  async function handleCreate(): Promise<void> {
    if (!name.trim()) return
    setCreating(true)
    try {
      await onCreate({
        name: name.trim(),
        sessionDate: sessionDate || null,
        engineer: engineer.trim() || null,
        artist: artist.trim() || null,
        folderId: selectedFolderId,
        facultyReserveEnabled
      })
      onClose()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <h2>{heading}</h2>
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
        {berkleeFeaturesEnabled && (
          <div className="inline-form">
            <ToggleSwitch
              checked={facultyReserveEnabled}
              onChange={setFacultyReserveEnabled}
              label="Show Berklee faculty reserve mics"
            />
          </div>
        )}
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
            {creating ? 'Creating…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
