import { useEffect, useState } from 'react'
import type { Building, Studio } from '@shared/types/entities'
import type { Setup } from '@shared/types/setup'
import { useNavigationStore } from '@renderer/state/navigationStore'
import NewSetupModal, { type NewSetupDetails } from '@renderer/components/NewSetupModal'

export default function BuildingStudioPicker(): JSX.Element {
  const buildingId = useNavigationStore((s) => s.buildingId)
  const goToBuilding = useNavigationStore((s) => s.goToBuilding)
  const goToPicker = useNavigationStore((s) => s.goToPicker)
  const goToStudioAdmin = useNavigationStore((s) => s.goToStudioAdmin)
  const goToSetup = useNavigationStore((s) => s.goToSetup)

  const [buildings, setBuildings] = useState<Building[]>([])
  const [studios, setStudios] = useState<Studio[]>([])
  const [setups, setSetups] = useState<Setup[]>([])
  const [selectedStudio, setSelectedStudio] = useState<Studio | null>(null)
  const [newBuildingName, setNewBuildingName] = useState('')
  const [newStudioName, setNewStudioName] = useState('')
  const [newSetupModalOpen, setNewSetupModalOpen] = useState(false)

  useEffect(() => {
    window.api.buildings.list().then(setBuildings)
  }, [])

  useEffect(() => {
    if (buildingId) {
      window.api.studios.listByBuilding(buildingId).then(setStudios)
      setSelectedStudio(null)
      setSetups([])
    } else {
      setStudios([])
    }
  }, [buildingId])

  useEffect(() => {
    if (selectedStudio) {
      window.api.setups.list(selectedStudio.id).then(setSetups)
    }
  }, [selectedStudio])

  async function createBuilding(): Promise<void> {
    if (!newBuildingName.trim()) return
    const building = await window.api.buildings.create(newBuildingName.trim())
    setNewBuildingName('')
    setBuildings((prev) => [...prev, building].sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function createStudio(): Promise<void> {
    if (!newStudioName.trim() || !buildingId) return
    const studio = await window.api.studios.create(buildingId, newStudioName.trim())
    setNewStudioName('')
    setStudios((prev) => [...prev, studio].sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function handleCreateSetup(details: NewSetupDetails): Promise<void> {
    if (!selectedStudio || !buildingId) return
    const setup = await window.api.setups.create(
      selectedStudio.id,
      details.name,
      details.sessionDate,
      details.folderId,
      details.engineer,
      details.artist,
      false
    )
    goToSetup(buildingId, selectedStudio.id, setup.id)
  }

  if (!buildingId) {
    return (
      <div className="page">
        <h2>Buildings</h2>
        <div className="list-grid">
          {buildings.map((b) => (
            <button key={b.id} className="card clickable" onClick={() => goToBuilding(b.id)}>
              <div className="card-title">{b.name}</div>
            </button>
          ))}
        </div>
        <div className="inline-form">
          <input
            placeholder="New building name"
            value={newBuildingName}
            onChange={(e) => setNewBuildingName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createBuilding()}
          />
          <button className="btn primary" onClick={createBuilding}>
            Add Building
          </button>
        </div>
      </div>
    )
  }

  const building = buildings.find((b) => b.id === buildingId)

  return (
    <div className="page">
      <div className="nav-crumbs">
        <button onClick={goToPicker}>Buildings</button> / {building?.name}
      </div>
      <h2>Studios in {building?.name}</h2>
      <div className="list-grid">
        {studios.map((s) => (
          <button
            key={s.id}
            className={`card clickable ${selectedStudio?.id === s.id ? 'active' : ''}`}
            onClick={() => setSelectedStudio(s)}
          >
            <div className="card-title">{s.name}</div>
          </button>
        ))}
      </div>
      <div className="inline-form">
        <input
          placeholder="New studio name"
          value={newStudioName}
          onChange={(e) => setNewStudioName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createStudio()}
        />
        <button className="btn primary" onClick={createStudio}>
          Add Studio
        </button>
      </div>

      {selectedStudio && (
        <>
          <div className="section-title">{selectedStudio.name}</div>
          <div className="inline-form" style={{ marginTop: 0 }}>
            <button className="btn" onClick={() => goToStudioAdmin(buildingId, selectedStudio.id)}>
              Studio Admin
            </button>
            <button className="btn primary" onClick={() => setNewSetupModalOpen(true)}>
              New Setup
            </button>
          </div>

          <div className="section-title">Saved Setups</div>
          {setups.length === 0 ? (
            <div className="empty-state">No saved setups yet for this studio.</div>
          ) : (
            <div className="list-grid">
              {setups.map((setup) => (
                <div key={setup.id} className="card">
                  <button
                    className="clickable"
                    style={{ background: 'none', border: 'none', color: 'inherit', textAlign: 'left', padding: 0 }}
                    onClick={() => goToSetup(buildingId, selectedStudio.id, setup.id)}
                  >
                    <div className="card-title">{setup.name}</div>
                    <div className="card-sub">{setup.sessionDate ?? 'no date'}</div>
                  </button>
                  <button
                    className="btn small danger"
                    onClick={async () => {
                      if (!window.confirm(`Delete "${setup.name}"? This cannot be undone.`)) return
                      await window.api.setups.remove(setup.id)
                      setSetups((prev) => prev.filter((s) => s.id !== setup.id))
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {newSetupModalOpen && (
        <NewSetupModal onClose={() => setNewSetupModalOpen(false)} onCreate={handleCreateSetup} />
      )}
    </div>
  )
}
