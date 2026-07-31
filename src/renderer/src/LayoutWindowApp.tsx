import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { KEYBIND_ACTIONS, normalizeKeyEvent } from '@shared/constants/keybindActions'
import { useSetupStore } from './state/setupStore'
import { useLayoutStore } from './state/layoutStore'
import { usePaletteStore } from './state/paletteStore'
import { useThemeStore } from './state/themeStore'
import { useKeybindPrefsStore } from './state/keybindPrefsStore'
import InstrumentPalette from './pages/SetupEditor/palette/InstrumentPalette'
import { exportStageToDataUrl } from './pages/SetupEditor/canvas/konvaExport'
import Toast from './components/Toast'
import appIcon from './assets/app-icon.png'

// Same rationale as SetupEditor.tsx's identical constant: batches a burst of block edits into one
// write instead of hammering a full blocks-table replace per drag/keystroke. Not imported from
// there — that file pulls in the whole Table Mode component tree (SetupSheetTable, SetupToolbar,
// …), which this window has no other reason to load.
const AUTOSAVE_DELAY_MS = 1000

// Mirrors SetupEditor.tsx's own lazy import of the same module — konva/react-konva only ever
// needs to parse once either window actually shows a canvas. Keeping this a dynamic import (not a
// static one) matters even here: a static import of a module the bundler already code-splits
// elsewhere risks folding it back into the shared/main chunk for BOTH windows.
const LayoutStage = lazy(() => import('./pages/SetupEditor/canvas/LayoutStage'))

/** Standalone-window handlers for the subset of KEYBIND_ACTIONS that make sense with no Table
 *  Mode in this process at all — layout-scoped actions, plus the handful of global ones (undo,
 *  redo, duplicate, delete, clear selection) that apply to blocks. Everything else (save-setup,
 *  add-source, toggle-mode, …) simply has no entry here, so a matching keypress or native menu
 *  click is a harmless no-op — same convention the main dispatcher already uses for an action with
 *  no handler in its current mode.
 *
 *  Module scope, not component state: every handler only ever reads useLayoutStore.getState() at
 *  call time, so there's nothing here that needs to be fresh per render. */
function handleUndoRedo(direction: 'undo' | 'redo'): void {
  const active = document.activeElement
  const isTextEditable =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active as HTMLElement)?.isContentEditable
  if (isTextEditable) {
    document.execCommand(direction)
    return
  }
  useLayoutStore.temporal.getState()[direction]()
  useLayoutStore.setState({ isDirty: true })
}

const handlers: Record<string, () => void> = {
  undo: () => handleUndoRedo('undo'),
  redo: () => handleUndoRedo('redo'),
  'duplicate-selection': () => {
    const ids = [...useLayoutStore.getState().selectedBlockIds]
    if (ids.length > 0) useLayoutStore.getState().duplicateBlocks(ids)
  },
  'delete-selection': () => {
    const ids = [...useLayoutStore.getState().selectedBlockIds]
    if (ids.length > 0) useLayoutStore.getState().removeBlocks(ids)
  },
  'delete-selection-layout': () => {
    const ids = [...useLayoutStore.getState().selectedBlockIds]
    if (ids.length > 0) useLayoutStore.getState().removeBlocks(ids)
  },
  'clear-selection': () => useLayoutStore.getState().selectBlock(null),
  'zoom-in': () => useLayoutStore.getState().zoomIn(),
  'zoom-out': () => useLayoutStore.getState().zoomOut(),
  'reset-view': () => useLayoutStore.getState().resetView()
}

function isTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/** Parsed once at boot — this window is pinned to one setup for its lifetime (see
 *  main/layoutWindow.ts), it never re-reads the URL later. */
function readLaunchParams(): { setupId: number; studioId: number } | null {
  const params = new URLSearchParams(window.location.search)
  const setupId = Number(params.get('setupId'))
  const studioId = Number(params.get('studioId'))
  if (!Number.isFinite(setupId) || !Number.isFinite(studioId)) return null
  return { setupId, studioId }
}

/** The standalone Layout Mode window's entire app shell — not a view inside the main App's
 *  navigationStore-driven switch, since this window has exactly one job (one setup's floor plan)
 *  and no navigation of its own. Rendered instead of <App/> when main.tsx sees `?window=layout` in
 *  the URL (see main/layoutWindow.ts's loadFile/loadURL call).
 *
 *  Deliberately light on bootstrap compared to App.tsx: no column/PDF/home-layout prefs, no
 *  Berklee-onboarding/What's-New checks, no setupStore items — this window never touches Table
 *  Mode data, only theme (so it doesn't look broken next to the main window), the shared palette,
 *  keybind overrides, and layoutStore itself. */
export default function LayoutWindowApp(): JSX.Element {
  const [params] = useState(readLaunchParams)
  const theme = useThemeStore((s) => s.theme)
  const blocks = useLayoutStore((s) => s.blocks)
  const isDirty = useLayoutStore((s) => s.isDirty)
  const isSaving = useLayoutStore((s) => s.isSaving)
  const save = useLayoutStore((s) => s.save)
  const stageRef = useRef<Konva.Stage>(null)
  const [setupName, setSetupName] = useState<string | null>(null)

  useEffect(() => {
    window.api.settings.get(APP_SETTINGS_KEYS.theme).then((saved) => {
      if (saved === 'light' || saved === 'dark') useThemeStore.setState({ theme: saved })
    })
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    usePaletteStore.getState().load()
    useKeybindPrefsStore.getState().load()
  }, [])

  // LayoutStage only ever reads setupId off setupStore (see LayoutStage.tsx) — no items are
  // loaded here, since Table Mode data belongs entirely to the main window's own setupStore
  // instance and this window never displays or edits it.
  useEffect(() => {
    if (!params) return
    useSetupStore.setState({ setupId: params.setupId, studioId: params.studioId })
    useLayoutStore.getState().loadForSetup(params.setupId)
    // A plain studio-scoped list, not getWithItems — just enough to label the window with which
    // setup's floor plan this is, without pulling in a full item load this window never uses.
    window.api.setups.list(params.studioId).then((setups) => {
      const match = setups.find((s) => s.id === params.setupId)
      if (match) {
        setSetupName(match.name)
        document.title = `Layout — ${match.name}`
      }
    })
  }, [params])

  // Debounced autosave, mirroring SetupEditor.tsx's — layoutStore only, since there's nothing
  // else to save here.
  useEffect(() => {
    if (!isDirty) return
    const timer = setTimeout(save, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [blocks, isDirty, save])

  // Close-flush handshake: a raw window close (the red button) has no React unmount to hook, so
  // main/layoutWindow.ts intercepts the native close, asks here, and waits for this ack before
  // actually closing. See LAYOUT_WINDOW_FLUSH_REQUEST_CHANNEL.
  useEffect(() => {
    return window.api.layoutWindow.onFlushRequested(async (request) => {
      try {
        const state = useLayoutStore.getState()
        if (state.isDirty) await state.save()
      } catch {
        // Best effort — still ack so the window isn't stuck waiting out the relay's own timeout
        // on a save failure. The edit stays in memory; there's nothing more useful to try before
        // the window closes/navigates anyway.
      } finally {
        window.api.layoutWindow.sendFlushAck({ requestId: request.requestId })
      }
    })
  }, [])

  // Export relay: the main window has no local Konva stage for this setup while it's popped out
  // (see the LayoutStage mount guard in SetupEditor.tsx), so PDF export asks THIS window to
  // render its own live stage and hand back the PNG. Null if the stage isn't up yet (e.g. mid
  // navigation) — the caller treats that the same as "couldn't reach the window."
  useEffect(() => {
    return window.api.layoutWindow.onExportImageRequested((request) => {
      let dataUrl: string | null = null
      if (stageRef.current) {
        try {
          dataUrl = exportStageToDataUrl(stageRef.current, request.pixelRatio, request.monochrome)
        } catch {
          dataUrl = null
        }
      }
      window.api.layoutWindow.sendExportImageResult({ requestId: request.requestId, dataUrl })
    })
  }, [])

  // Mouse path (native Edit menu, now correctly targeting whichever window is focused — see
  // menu.ts) and keyboard path, both dispatching through the same module-scope `handlers` above.
  useEffect(() => {
    return window.api.menu.onAction((action) => handlers[action]?.())
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (isTextField(e.target)) return
      const combo = normalizeKeyEvent(e)
      if (!combo) return
      const { resolve } = useKeybindPrefsStore.getState()
      for (const action of KEYBIND_ACTIONS) {
        if (action.id === 'open-settings' || action.scope === 'table') continue
        if (resolve(action.id) !== combo) continue
        const handler = handlers[action.id]
        if (handler) {
          e.preventDefault()
          handler()
        }
        return
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (!params) {
    return (
      <div className="page">
        <div className="empty-state">This window wasn&apos;t opened correctly — close it and try again.</div>
      </div>
    )
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
      <div className="top-bar">
        <img src={appIcon} alt="" className="top-bar-icon" />
        <h1>{setupName ?? 'Layout'}</h1>
        <div className="spacer" />
        {isSaving && <span className="card-sub">Saving…</span>}
        {!isSaving && isDirty && <span className="card-sub">Unsaved changes</span>}
        {!isSaving && !isDirty && <span className="card-sub">Saved</span>}
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <InstrumentPalette />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Suspense fallback={null}>
            <LayoutStage studioId={params.studioId} stageRef={stageRef} active />
          </Suspense>
        </div>
      </div>
      <Toast />
    </div>
  )
}
