import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import LayoutWindowApp from './LayoutWindowApp'
import ErrorBoundary from './components/ErrorBoundary'
import { useThemeStore } from './state/themeStore'
import { useA11yPrefsStore } from './state/a11yPrefsStore'
import './styles/global.css'

// BEFORE createRoot, and synchronously — this is the whole reason window.api.theme.getSync exists.
// index.html's CSP is `script-src 'self'`, so there is no inline bootstrap script to set
// data-theme in the document head, and an async settings read resolves after the first paint: a
// light-mode user saw a dark frame on every launch. Reading it here costs one IPC hop against an
// already-open database and puts the attribute on <html> before React renders anything.
const bootstrapTheme = window.api.theme.getSync()
document.documentElement.dataset.theme = bootstrapTheme.resolved
useThemeStore.setState(bootstrapTheme)

// Same bootstrap, same reason: an increased-contrast user would otherwise get one frame of faint
// borders. `data-contrast` carries the PREFERENCE verbatim — global.css resolves 'system' itself
// through @media (prefers-contrast: more), so there is nothing for main to resolve first.
// uiScale rides along only to seed the Settings picker: main applies it to the webContents itself.
const bootstrapA11y = window.api.accessibility.getSync()
document.documentElement.dataset.contrast = bootstrapA11y.contrast
useA11yPrefsStore.setState(bootstrapA11y)

// A file dragged from Finder onto anything that doesn't handle drops would otherwise be NAVIGATED
// to — Chromium's default swaps the whole UI for the dropped PDF or image. Main blocks that
// navigation in will-navigate (windowGuards.ts); this is the renderer's half, so the page never
// offers a drop it won't handle in the first place. Both events matter: a drop only fires where
// dragover was prevented, and an unprevented drop is what triggers the navigation.
//
// Only file drags, and only ones nothing else claimed: the Layout palette drags carry
// application/json and stay untouched, and a real drop target (the Layout canvas, the
// spreadsheet-import backdrop) has already called preventDefault by the time the event reaches
// document — React listens on the root container, below this — so its own dropEffect stands.
for (const type of ['dragover', 'drop'] as const) {
  document.addEventListener(type, (e) => {
    if (e.defaultPrevented) return
    if (!e.dataTransfer?.types.includes('Files')) return
    e.preventDefault()
  })
}

// Both windows load the same bundle and index.html — main/layoutWindow.ts distinguishes the
// standalone Layout Mode window with a `?window=layout` query param at loadFile/loadURL time (see
// its doc comment for why: no other cross-window state exists at boot to key off instead).
const isLayoutWindow = new URLSearchParams(window.location.search).get('window') === 'layout'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>{isLayoutWindow ? <LayoutWindowApp /> : <App />}</ErrorBoundary>
  </React.StrictMode>
)
