import { useEffect, useState } from 'react'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import type { StudioExportFile } from '@shared/types/ipc'
import { useNavigationStore } from '@renderer/state/navigationStore'
import { useThemeStore } from '@renderer/state/themeStore'
import { useBerkleeFeaturesStore } from '@renderer/state/berkleeFeaturesStore'
import { useColumnPrefsStore } from '@renderer/state/columnPrefsStore'
import { TOGGLEABLE_COLUMNS } from '@shared/constants/setupColumns'
import ToggleSwitch from '@renderer/components/ToggleSwitch'
import FacultyReserveEditor from './FacultyReserveEditor'
import PersonalGearEditor from './PersonalGearEditor'
import PaletteEditor from './PaletteEditor'
import StudioExportPage from './StudioExportPage'
import StudioImportPage from './StudioImportPage'
import ManagePresetsModal from '../PresetManager/ManagePresetsModal'

type Subview = { kind: 'main' } | { kind: 'export' } | { kind: 'import'; file: StudioExportFile }
type Tab = 'general' | 'columns' | 'personalGear' | 'facultyReserve' | 'backup' | 'theme' | 'palette'

export default function SettingsPage(): JSX.Element {
  const goToHome = useNavigationStore((s) => s.goToHome)
  const closeSettings = useNavigationStore((s) => s.closeSettings)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const berkleeFeaturesEnabled = useBerkleeFeaturesStore((s) => s.enabled)
  const enableBerkleeFeatures = useBerkleeFeaturesStore((s) => s.enable)
  const disableBerkleeFeatures = useBerkleeFeaturesStore((s) => s.disable)
  const defaultVisibleColumns = useColumnPrefsStore((s) => s.defaultVisibleColumns)
  const setDefaultColumns = useColumnPrefsStore((s) => s.setDefault)
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [defaultEngineerName, setDefaultEngineerName] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [subview, setSubview] = useState<Subview>({ kind: 'main' })
  const [managePresetsOpen, setManagePresetsOpen] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)

  const TABS: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'columns', label: 'Columns' },
    { id: 'theme', label: 'Theme' },
    { id: 'personalGear', label: 'Personal Gear Locker' },
    ...(berkleeFeaturesEnabled ? [{ id: 'facultyReserve' as const, label: 'Faculty Reserve' }] : []),
    { id: 'palette', label: 'Layout Palette' },
    { id: 'backup', label: 'Import/Export' }
  ]

  // If Berklee features get disabled while the Faculty Reserve tab is selected, fall back to
  // General rather than leaving the page on a now-hidden tab with no matching button.
  useEffect(() => {
    if (!berkleeFeaturesEnabled && activeTab === 'facultyReserve') setActiveTab('general')
  }, [berkleeFeaturesEnabled, activeTab])

  useEffect(() => {
    window.api.settings.get(APP_SETTINGS_KEYS.defaultEngineerName).then((engineerValue) => {
      setDefaultEngineerName(engineerValue ?? '')
      setLoaded(true)
    })
  }, [])

  async function handleDefaultEngineerNameBlur(): Promise<void> {
    await window.api.settings.set(APP_SETTINGS_KEYS.defaultEngineerName, defaultEngineerName.trim())
  }

  async function handleImportClick(): Promise<void> {
    setImportMessage(null)
    const result = await window.api.studios.pickImportFile()
    if (result.canceled) return
    if (result.error || !result.data) {
      setImportMessage(result.error ?? 'Could not read that file.')
      return
    }
    if (result.data.studios.length === 1) {
      await window.api.studios.importStudios(result.data.studios)
      setImportMessage(`Imported "${result.data.studios[0].name}".`)
      return
    }
    setSubview({ kind: 'import', file: result.data })
  }

  // Escape backs out one level at a time — closes an open Export/Import subview back to the
  // main tabs first, only closes Settings entirely once already on the main tabs.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      // The Manage-presets modal is layered on top and owns Escape while open — let it handle it.
      if (managePresetsOpen) return
      if (subview.kind === 'main') closeSettings()
      else setSubview({ kind: 'main' })
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [subview, closeSettings, managePresetsOpen])

  if (!loaded) return <div className="page" />

  if (subview.kind === 'export') {
    return <StudioExportPage onBack={() => setSubview({ kind: 'main' })} />
  }
  if (subview.kind === 'import') {
    return (
      <StudioImportPage
        file={subview.file}
        onBack={() => setSubview({ kind: 'main' })}
        onDone={() => setSubview({ kind: 'main' })}
      />
    )
  }

  return (
    <div className="page">
      <div className="nav-crumbs">
        <button onClick={goToHome}>Home</button> / Settings
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: '8px 0' }}>Settings</h2>
        <button className="btn" onClick={closeSettings}>
          Close
        </button>
      </div>

      <div className="inline-form" style={{ marginBottom: 16 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'btn primary' : 'btn'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="panel">
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>Default engineer name</label>
            <input
              value={defaultEngineerName}
              onChange={(e) => setDefaultEngineerName(e.target.value)}
              onBlur={handleDefaultEngineerNameBlur}
              placeholder="e.g. Julian Rose"
              style={{ width: 240 }}
            />
            <p className="card-sub" style={{ marginTop: 4 }}>Prefills the Engineer field on every new setup.</p>
          </div>

          <div style={{ marginTop: 20 }}>
            <button className="btn" onClick={() => setManagePresetsOpen(true)}>
              Manage channel presets…
            </button>
          </div>

          <div style={{ marginTop: 20 }}>
            <ToggleSwitch
              checked={berkleeFeaturesEnabled === true}
              onChange={(on) => (on ? enableBerkleeFeatures() : disableBerkleeFeatures())}
              label="Berklee features"
            />
            <p className="card-sub" style={{ marginTop: 4 }}>
              Shows Berklee's studios, gear lists, and faculty reserve pool
            </p>
          </div>
        </div>
      )}

      {activeTab === 'columns' && (
        <div className="panel">
          <p className="card-sub" style={{ marginTop: 0, marginBottom: 16 }}>
            Choose which columns a new setup starts with. Existing setups aren't affected — adjust those from the
            Columns menu above their table. (Source name is always shown.)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320 }}>
            {TOGGLEABLE_COLUMNS.map((c) => (
              <ToggleSwitch
                key={c.key}
                checked={defaultVisibleColumns.includes(c.key)}
                onChange={(on) =>
                  setDefaultColumns(
                    on ? [...defaultVisibleColumns, c.key] : defaultVisibleColumns.filter((k) => k !== c.key)
                  )
                }
                label={c.label}
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'personalGear' && (
        <div className="panel">
          <p className="card-sub" style={{ marginTop: 0 }}>
            Your own gear, always available in the mic/outboard pickers for every setup — persists across every
            studio and project.
          </p>
          <PersonalGearEditor />
        </div>
      )}

      {activeTab === 'facultyReserve' && berkleeFeaturesEnabled && (
        <div className="panel">
          <FacultyReserveEditor />
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="panel">
          <div className="inline-form" style={{ marginTop: 0 }}>
            <button className="btn" onClick={() => setSubview({ kind: 'export' })}>
              Export studios…
            </button>
            <button className="btn" onClick={handleImportClick}>
              Import Studios…
            </button>
          </div>
          {importMessage && <p className="card-sub">{importMessage}</p>}
        </div>
      )}

      {activeTab === 'theme' && (
        <div className="panel">
          <ToggleSwitch checked={theme === 'dark'} onChange={(on) => setTheme(on ? 'dark' : 'light')} label="Dark mode" />
        </div>
      )}

      {activeTab === 'palette' && (
        <div className="panel">
          <PaletteEditor />
        </div>
      )}

      {managePresetsOpen && <ManagePresetsModal onClose={() => setManagePresetsOpen(false)} />}
    </div>
  )
}
