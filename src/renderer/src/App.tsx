import { useEffect } from 'react'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { useNavigationStore } from './state/navigationStore'
import { useThemeStore } from './state/themeStore'
import { usePaletteStore } from './state/paletteStore'
import Home from './pages/Home/Home'
import SettingsPage from './pages/SettingsPage/SettingsPage'
import SetupEditor from './pages/SetupEditor/SetupEditor'
import StudioSetupPage from './pages/StudioSetup/StudioSetupPage'

export default function App(): JSX.Element {
  const view = useNavigationStore((s) => s.view)
  const goToHome = useNavigationStore((s) => s.goToHome)
  const goToSettings = useNavigationStore((s) => s.goToSettings)
  const theme = useThemeStore((s) => s.theme)

  // Load the persisted theme once at startup, before the user ever opens Settings. Hydrates
  // via setState directly (not the persisting setTheme action) so loading doesn't write it
  // right back to app_settings.
  useEffect(() => {
    window.api.settings.get(APP_SETTINGS_KEYS.theme).then((saved) => {
      if (saved === 'light' || saved === 'dark') {
        useThemeStore.setState({ theme: saved })
      }
    })
  }, [])

  // Keep the DOM attribute in sync with the store so global.css can key off it.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Load the global Layout Mode palette once at startup — shared across every studio/setup.
  useEffect(() => {
    usePaletteStore.getState().load()
  }, [])

  return (
    <div className="app-shell">
      <div className="top-bar">
        <h1>Setup Sheet Helper</h1>
        <button className="btn small" onClick={goToHome}>
          Home
        </button>
        <div className="spacer" />
        <button className="btn small" onClick={goToSettings}>
          Settings
        </button>
      </div>
      {view === 'home' && <Home />}
      {view === 'setup' && <SetupEditor />}
      {view === 'studioSetup' && <StudioSetupPage />}
      {view === 'settings' && <SettingsPage />}
    </div>
  )
}
