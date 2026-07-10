import { useEffect, useState } from 'react'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import type { StudioExportFile } from '@shared/types/ipc'
import { useNavigationStore } from '@renderer/state/navigationStore'
import { useThemeStore } from '@renderer/state/themeStore'
import FacultyReserveEditor from './FacultyReserveEditor'
import PersonalGearEditor from './PersonalGearEditor'
import PaletteEditor from './PaletteEditor'
import StudioExportPage from './StudioExportPage'
import StudioImportPage from './StudioImportPage'
import PresetManager from '../PresetManager/PresetManager'

type Subview = { kind: 'main' } | { kind: 'export' } | { kind: 'import'; file: StudioExportFile } | { kind: 'presets' }
type Tab = 'general' | 'personalGear' | 'facultyReserve' | 'backup' | 'theme' | 'palette'

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'theme', label: 'Theme' },
  { id: 'personalGear', label: 'Personal Gear Locker' },
  { id: 'facultyReserve', label: 'Faculty Reserve' },
  { id: 'palette', label: 'Layout Palette' },
  { id: 'backup', label: 'Import/Export' }
]

export default function SettingsPage(): JSX.Element {
  const goToHome = useNavigationStore((s) => s.goToHome)
  const closeSettings = useNavigationStore((s) => s.closeSettings)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [defaultEngineerName, setDefaultEngineerName] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [subview, setSubview] = useState<Subview>({ kind: 'main' })
  const [importMessage, setImportMessage] = useState<string | null>(null)

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
      if (subview.kind === 'main') closeSettings()
      else setSubview({ kind: 'main' })
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [subview, closeSettings])

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
  if (subview.kind === 'presets') {
    return <PresetManager onBack={() => setSubview({ kind: 'main' })} />
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
              placeholder="e.g. Jordan Rivera"
              style={{ width: 240 }}
            />
            <p className="card-sub" style={{ marginTop: 4 }}>Prefills the Engineer field on every new setup.</p>
          </div>

          <div style={{ marginTop: 20 }}>
            <button className="btn" onClick={() => setSubview({ kind: 'presets' })}>
              Manage Channel Presets…
            </button>
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

      {activeTab === 'facultyReserve' && (
        <div className="panel">
          <FacultyReserveEditor />
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="panel">
          <div className="inline-form" style={{ marginTop: 0 }}>
            <button className="btn" onClick={() => setSubview({ kind: 'export' })}>
              Export Studios…
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={theme === 'dark'}
              onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
            />
            Dark Mode
          </label>
        </div>
      )}

      {activeTab === 'palette' && (
        <div className="panel">
          <PaletteEditor />
        </div>
      )}
    </div>
  )
}
