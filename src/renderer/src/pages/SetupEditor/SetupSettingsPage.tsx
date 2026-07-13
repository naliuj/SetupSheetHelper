import { useState } from 'react'
import { useSetupStore } from '@renderer/state/setupStore'
import { useBerkleeFeaturesStore } from '@renderer/state/berkleeFeaturesStore'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
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

  useEscapeToClose(onBack)

  // "General" only has content for Berklee users (the faculty reserve toggle) — when it's
  // filtered out, Session Gear is the only tab left, so skip the tab strip entirely rather than
  // showing a single, purposeless tab button. This also naturally handles Berklee features being
  // turned off while "General" is the active tab: with no strip, the gear locker is forced back
  // into view instead of leaving an empty panel behind.
  const visibleTabs = TABS.filter((t) => t.key !== 'general' || berkleeFeaturesEnabled)
  const showTabStrip = visibleTabs.length > 1
  const activeTab = showTabStrip ? tab : 'gear'

  return (
    <div className="page">
      <div className="nav-crumbs">
        <button onClick={onBack}>Setup Editor</button> / Setup Settings
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2>Setup settings</h2>
        <button className="btn" onClick={onBack}>
          Close
        </button>
      </div>
      {showTabStrip && (
        <div className="inline-form" style={{ marginTop: 0 }}>
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              className={`btn ${tab === t.key ? 'primary' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="panel" style={{ marginTop: showTabStrip ? 16 : 0 }}>
        {activeTab === 'gear' && <SetupGearLocker setupId={setupId} />}
        {activeTab === 'general' && berkleeFeaturesEnabled && (
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
