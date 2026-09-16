import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import LayoutWindowApp from './LayoutWindowApp'
import ErrorBoundary from './components/ErrorBoundary'
import { useThemeStore } from './state/themeStore'
import './styles/global.css'

// BEFORE createRoot, and synchronously — this is the whole reason window.api.theme.getSync exists.
// index.html's CSP is `script-src 'self'`, so there is no inline bootstrap script to set
// data-theme in the document head, and an async settings read resolves after the first paint: a
// light-mode user saw a dark frame on every launch. Reading it here costs one IPC hop against an
// already-open database and puts the attribute on <html> before React renders anything.
const bootstrapTheme = window.api.theme.getSync()
document.documentElement.dataset.theme = bootstrapTheme.resolved
useThemeStore.setState(bootstrapTheme)

// Both windows load the same bundle and index.html — main/layoutWindow.ts distinguishes the
// standalone Layout Mode window with a `?window=layout` query param at loadFile/loadURL time (see
// its doc comment for why: no other cross-window state exists at boot to key off instead).
const isLayoutWindow = new URLSearchParams(window.location.search).get('window') === 'layout'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>{isLayoutWindow ? <LayoutWindowApp /> : <App />}</ErrorBoundary>
  </React.StrictMode>
)
