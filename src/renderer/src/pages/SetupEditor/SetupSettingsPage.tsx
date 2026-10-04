import { useState } from 'react'
import { useSetupStoreState } from '@renderer/state/setupStoreContext'
import { useBerkleeFeaturesStore } from '@renderer/state/berkleeFeaturesStore'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import ToggleSwitch from '@renderer/components/ToggleSwitch'
import SetupGearLocker from './SetupGearLocker'
import SetupLayoutSettings from './SetupLayoutSettings'

type Tab = 'gear' | 'general' | 'layout'

interface Props {
  setupId: number
  onBack: () => void
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'layout', label: 'Room Layout' },
  { key: 'gear', label: 'Session Gear' }
]

export default function SetupSettingsPage({ setupId, onBack }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab | null>(null)
  const studioId = useSetupStoreState((s) => s.studioId)
  const facultyReserveEnabled = useSetupStoreState((s) => s.facultyReserveEnabled)
  const setFacultyReserveEnabled = useSetupStoreState((s) => s.setFacultyReserveEnabled)
  const berkleeFeaturesEnabled = useBerkleeFeaturesStore((s) => s.enabled)

  useEscapeToClose(onBack)

  // "General" only has content for Berklee users (the faculty reserve toggle), so it's left out
  // for everyone else; Room Layout needs the setup's studio. The tab strip only shows when there's
  // more than one tab, and the first visible tab is the default.
  const visibleTabs = TABS.filter(
    (t) => (t.key !== 'general' || berkleeFeaturesEnabled) && (t.key !== 'layout' || studioId != null)
  )
  const showTabStrip = visibleTabs.length > 1
  const activeTab: Tab = tab && visibleTabs.some((t) => t.key === tab) ? tab : visibleTabs[0].key

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
              className={`btn ${activeTab === t.key ? 'primary' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="panel" style={{ marginTop: showTabStrip ? 16 : 0 }}>
        {activeTab === 'gear' && <SetupGearLocker setupId={setupId} />}
        {activeTab === 'layout' && studioId != null && <SetupLayoutSettings setupId={setupId} studioId={studioId} />}
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
