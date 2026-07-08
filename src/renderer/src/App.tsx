import { useNavigationStore } from './state/navigationStore'
import Home from './pages/Home/Home'
import SettingsPage from './pages/SettingsPage/SettingsPage'
import SetupEditor from './pages/SetupEditor/SetupEditor'
import StudioSetupPage from './pages/StudioSetup/StudioSetupPage'

export default function App(): JSX.Element {
  const view = useNavigationStore((s) => s.view)
  const goToHome = useNavigationStore((s) => s.goToHome)
  const goToSettings = useNavigationStore((s) => s.goToSettings)

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
