import { useEffect } from 'react'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { useNavigationStore } from './state/navigationStore'
import { useThemeStore } from './state/themeStore'
import { usePaletteStore } from './state/paletteStore'
import { useBerkleeFeaturesStore } from './state/berkleeFeaturesStore'
import { useColumnPrefsStore } from './state/columnPrefsStore'
import { usePdfLayoutPrefsStore } from './state/pdfLayoutPrefsStore'
import { useKeybindPrefsStore } from './state/keybindPrefsStore'
import { normalizeKeyEvent } from '@shared/constants/keybindActions'
import Home from './pages/Home/Home'
import SettingsPage from './pages/SettingsPage/SettingsPage'
import SetupEditor from './pages/SetupEditor/SetupEditor'
import StudioSetupPage from './pages/StudioSetup/StudioSetupPage'
import BerkleeOnboardingModal from './components/BerkleeOnboardingModal'

export default function App(): JSX.Element {
  const view = useNavigationStore((s) => s.view)
  const goToHome = useNavigationStore((s) => s.goToHome)
  const goToSettings = useNavigationStore((s) => s.goToSettings)
  const theme = useThemeStore((s) => s.theme)
  const onboardingPromptOpen = useBerkleeFeaturesStore((s) => s.onboardingPromptOpen)

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

  // Load the Berklee-features setting once at startup — surfaces the onboarding prompt if it's
  // never been answered (see berkleeFeaturesStore.load()).
  useEffect(() => {
    useBerkleeFeaturesStore.getState().load()
  }, [])

  // Load the default column visibility once at startup — new setups snapshot it, and the Settings
  // → Columns tab edits it.
  useEffect(() => {
    useColumnPrefsStore.getState().load()
  }, [])

  // Load the PDF export style preferences once at startup — read directly by exportSetupPdf on
  // the main process, but the Settings → PDF Layout tab needs them hydrated to display/edit.
  useEffect(() => {
    usePdfLayoutPrefsStore.getState().load()
  }, [])

  // Load keybind customizations once at startup — read by both this file's own keydown listener
  // below and SetupToolbar's, plus the Settings → Keybinds editor.
  useEffect(() => {
    useKeybindPrefsStore.getState().load()
  }, [])

  // App-wide "App Settings…" — mouse-click path (native menu item, still sends this MenuAction)
  // stays wired here since Settings must be reachable from any view, not just inside an open
  // setup (SetupToolbar's unified keybind dispatcher only exists inside the editor). The
  // keyboard path is now a plain keydown match against the user's configured combo instead of a
  // native Electron accelerator — see SetupToolbar.tsx for why (text-field safety + rebindability
  // for every other action); this is the one action that needs its own copy of that match logic
  // because it must work outside the editor too.
  useEffect(() => {
    return window.api.menu.onAction((action) => {
      if (action === 'open-settings') goToSettings()
    })
  }, [goToSettings])

  useEffect(() => {
    function isTextField(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (isTextField(e.target)) return
      const combo = normalizeKeyEvent(e)
      if (combo && combo === useKeybindPrefsStore.getState().resolve('open-settings')) {
        e.preventDefault()
        goToSettings()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToSettings])

  return (
    <div className="app-shell">
      <div className="top-bar">
        <h1>Setup Sheet Helper</h1>
        <button className="btn small" onClick={goToHome}>
          Home
        </button>
        <div className="spacer" />
        <button className="btn small" onClick={() => goToSettings()}>
          Settings
        </button>
      </div>
      {view === 'home' && <Home />}
      {view === 'setup' && <SetupEditor />}
      {view === 'studioSetup' && <StudioSetupPage />}
      {view === 'settings' && <SettingsPage />}
      {onboardingPromptOpen && <BerkleeOnboardingModal />}
    </div>
  )
}
