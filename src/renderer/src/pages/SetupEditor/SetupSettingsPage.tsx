import { useState } from 'react'
import { useSetupStore } from '@renderer/state/setupStore'
import { useBerkleeFeaturesStore } from '@renderer/state/berkleeFeaturesStore'
import ToggleSwitch from '@renderer/components/ToggleSwitch'
import SetupGearLocker from './SetupGearLocker'

type Tab = 'gear' | 'general'

interface Props {
  setupId: number
  onBack: () => void
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'gear', label: 'Session Gear' },
  { key: 'general', label: 'General' }
]

export default function SetupSettingsPage({ setupId, onBack }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('gear')
  const facultyReserveEnabled = useSetupStore((s) => s.facultyReserveEnabled)
  const setFacultyReserveEnabled = useSetupStore((s) => s.setFacultyReserveEnabled)
  const berkleeFeaturesEnabled = useBerkleeFeaturesStore((s) => s.enabled)

  return (
    <div className="page">
      <div className="nav-crumbs">
        <button onClick={onBack}>Setup Editor</button> / Setup Settings
      </div>
      <h2>Setup settings</h2>
      <div className="inline-form" style={{ marginTop: 0 }}>
        {TABS.map((t) => (
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
        {tab === 'gear' && <SetupGearLocker setupId={setupId} />}
        {tab === 'general' && berkleeFeaturesEnabled && (
          <ToggleSwitch
            checked={facultyReserveEnabled}
            onChange={setFacultyReserveEnabled}
            label="Show Berklee faculty reserve mics"
          />
        )}
      </div>
    </div>
  )
}
