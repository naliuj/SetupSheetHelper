import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import LayoutWindowApp from './LayoutWindowApp'
import './styles/global.css'

// Both windows load the same bundle and index.html — main/layoutWindow.ts distinguishes the
// standalone Layout Mode window with a `?window=layout` query param at loadFile/loadURL time (see
// its doc comment for why: no other cross-window state exists at boot to key off instead).
const isLayoutWindow = new URLSearchParams(window.location.search).get('window') === 'layout'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isLayoutWindow ? <LayoutWindowApp /> : <App />}</React.StrictMode>
)
