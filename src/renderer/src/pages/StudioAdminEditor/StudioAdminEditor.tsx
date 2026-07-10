import { useState } from 'react'
import { useNavigationStore } from '@renderer/state/navigationStore'
import MicLockerEditor from './MicLockerEditor'
import OutboardEditor from './OutboardEditor'
import PreampLockerEditor from './PreampLockerEditor'
import LayoutFileUploader from './LayoutFileUploader'
import BuildingGearPoolEditor from './BuildingGearPoolEditor'

type Tab = 'mics' | 'outboard' | 'preamps' | 'layout' | 'buildingPool'

export default function StudioAdminEditor(): JSX.Element {
  const studioId = useNavigationStore((s) => s.studioId)
  const buildingId = useNavigationStore((s) => s.buildingId)
  const goToPicker = useNavigationStore((s) => s.goToPicker)
  const [tab, setTab] = useState<Tab>('mics')

  if (!studioId || !buildingId) {
    return (
      <div className="page">
        <div className="empty-state">No studio selected.</div>
      </div>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'mics', label: 'Mic Locker' },
    { key: 'outboard', label: 'Outboard Gear' },
    { key: 'preamps', label: 'Preamp Locker' },
    { key: 'layout', label: 'Room Layout' },
    { key: 'buildingPool', label: 'Building Shared Gear Pool' }
  ]

  return (
    <div className="page">
      <div className="nav-crumbs">
        <button onClick={goToPicker}>Buildings</button> / Studio Admin
      </div>
      <h2>Studio Admin</h2>
      <div className="inline-form" style={{ marginTop: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`btn ${tab === t.key ? 'primary' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        {tab === 'mics' && <MicLockerEditor studioId={studioId} />}
        {tab === 'outboard' && <OutboardEditor studioId={studioId} />}
        {tab === 'preamps' && <PreampLockerEditor studioId={studioId} />}
        {tab === 'layout' && <LayoutFileUploader studioId={studioId} />}
        {tab === 'buildingPool' && <BuildingGearPoolEditor buildingId={buildingId} />}
      </div>
    </div>
  )
}
