import { useEffect } from 'react'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { useNavigationStore } from './state/navigationStore'
import { useThemeStore } from './state/themeStore'
import { usePaletteStore } from './state/paletteStore'
import { useBerkleeFeaturesStore } from './state/berkleeFeaturesStore'
import { useWhatsNewStore } from './state/whatsNewStore'
import { useColumnPrefsStore } from './state/columnPrefsStore'
import { usePdfLayoutPrefsStore } from './state/pdfLayoutPrefsStore'
import { useKeybindPrefsStore } from './state/keybindPrefsStore'
import { useHomeLayoutStore } from './state/homeLayoutStore'
import { useLayoutWindowStore } from './state/layoutWindowStore'
import { normalizeKeyEvent } from '@shared/constants/keybindActions'
import Home from './pages/Home/Home'
import SettingsPage from './pages/SettingsPage/SettingsPage'
import SetupEditor from './pages/SetupEditor/SetupEditor'
import StudioSetupPage from './pages/StudioSetup/StudioSetupPage'
import BerkleeOnboardingModal from './components/BerkleeOnboardingModal'
import WhatsNewModal from './components/WhatsNewModal'
import appIcon from './assets/app-icon.png'

export default function App(): JSX.Element {
  const view = useNavigationStore((s) => s.view)
  const goToHome = useNavigationStore((s) => s.goToHome)
  const goToSettings = useNavigationStore((s) => s.goToSettings)
  const theme = useThemeStore((s) => s.theme)
  const onboardingPromptOpen = useBerkleeFeaturesStore((s) => s.onboardingPromptOpen)
  const whatsNewOpen = useWhatsNewStore((s) => s.open)

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

  // Compare the running app version against the last one the user has seen a changelog for —
  // surfaces the "What's New" modal on a real upgrade, stays silent on a fresh install (see
  // whatsNewStore.load()).
  useEffect(() => {
    useWhatsNewStore.getState().load()
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

  // Load the home-screen layout preference once at startup — read by Home, edited in Settings →
  // General.
  useEffect(() => {
    useHomeLayoutStore.getState().load()
  }, [])

  // Whether the standalone Layout Mode window is currently open, and for which setup — read by
  // SetupToolbar (grey out the local toggle) and SetupEditor (skip mounting its own LayoutStage).
  useEffect(() => {
    useLayoutWindowStore.getState().hydrate()
  }, [])

  // App-wide "App Settings…" — mouse-click path (native menu item, still sends this MenuAction)
  // stays wired here since Settings must be reachable from any view, not just inside an open
  // setup (SetupToolbar's unified keybind dispatcher only exists inside the editor). The
  // keyboard path is now a plain keydown match against the user's configured combo instead of a
  // native Electron accelerator — see SetupToolbar.tsx for why (text-field safety + rebindability
  // for every other action); this is the one action that needs its own copy of that match logic
  // because it must work outside the editor too.
  //
  // "Select All" carries a real accelerator (menu.ts) unlike every other app-defined action,
  // since — like cut/copy/paste — the OS needs an actual menu accelerator to route Cmd/Ctrl+A to
  // a focused text field at all; without one, pressing it does nothing anywhere in the app. That
  // means (unlike open-settings) it fires from every screen, not just inside an open setup, so the
  // "select all text in the focused field" half of the behavior lives here where it always runs.
  // SetupToolbar's own handleSelectAll does the identical check for the same reason when a setup
  // is open, then falls through to selecting every row/block if no text field has focus.
  useEffect(() => {
    return window.api.menu.onAction((action) => {
      if (action === 'open-settings') goToSettings()
      if (action === 'show-whats-new') useWhatsNewStore.getState().openManually()
      if (action === 'select-all') {
        const active = document.activeElement
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
          active.select()
        } else if ((active as HTMLElement | null)?.isContentEditable) {
          document.execCommand('selectAll')
        }
      }
    })
  }, [goToSettings])

  // Hidden debug hook to pop the What's New modal on demand from the DevTools console
  // (`showWhatsNew()`) — deliberately not a KEYBIND_ACTIONS entry or menu item duplicate, since
  // the whole point is that it stays undiscoverable rather than being a real, user-facing trigger.
  useEffect(() => {
    ;(window as unknown as { showWhatsNew: () => void }).showWhatsNew = () =>
      useWhatsNewStore.getState().openManually()
  }, [])

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
        <img src={appIcon} alt="" className="top-bar-icon" />
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
      {whatsNewOpen && <WhatsNewModal />}
    </div>
  )
}
