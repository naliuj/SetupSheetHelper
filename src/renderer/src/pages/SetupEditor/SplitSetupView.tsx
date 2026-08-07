import { useEffect, useRef, useState } from 'react'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { useNavigationStore, type EditorMode } from '@renderer/state/navigationStore'
import { useSetupStore, createSetupStore } from '@renderer/state/setupStore'
import { useLayoutStore, createLayoutStore } from '@renderer/state/layoutStore'
import { SetupStoreProvider } from '@renderer/state/setupStoreContext'
import { LayoutStoreProvider } from '@renderer/state/layoutStoreContext'
import SetupEditorPane from './SetupEditorPane'
import SplitDivider from './SplitDivider'
import Toast from '@renderer/components/Toast'

const DEFAULT_RATIO = 0.5
const MIN_RATIO = 0.2
const MAX_RATIO = 0.8
const RATIO_SAVE_DELAY_MS = 500

interface Props {
  buildingId: number | null
  studioId: number
  /** The pane that was already open before Split View started — reuses the app-wide singleton
   *  stores unchanged (see rightStores' doc comment below for why only the right pane needs a
   *  fresh instance). */
  leftSetupId: number | null
  rightSetupId: number
  leftMode: EditorMode
  onLeftModeChange: (mode: EditorMode) => void
  onBackToHome: () => void
}

/** Split View's container: two independent SetupEditorPanes side by side, each backed by its own
 *  setupStore/layoutStore instance so editing, autosave, and undo/redo in one pane never touches
 *  the other (see setupStoreContext.tsx/layoutStoreContext.tsx for how a pane's subtree resolves
 *  "which instance"). Stays within this one Electron window/renderer — unlike the dual-monitor
 *  Layout Mode pop-out, which is a deliberate singleton second `BrowserWindow` for one canvas on
 *  a second monitor; that pattern isn't reused here. */
export default function SplitSetupView({
  buildingId,
  studioId,
  leftSetupId,
  rightSetupId,
  leftMode,
  onLeftModeChange,
  onBackToHome
}: Props): JSX.Element {
  const closeSplitView = useNavigationStore((s) => s.closeSplitView)
  const rightMode = useNavigationStore((s) => s.splitEditorMode)
  const setRightMode = useNavigationStore((s) => s.setSplitEditorMode)

  // The left pane reuses the app-wide singleton stores unchanged — its SetupEditorPane sits
  // outside any Provider below, so useSetupStoreState/useSetupStoreApi resolve to the same
  // instance they always did (context defaults to the singleton). Nothing to load or flush for
  // it on Split View entry: it's the exact same store object, just now rendered inside this
  // container instead of directly under SetupEditor.tsx.
  //
  // The right pane needs a genuinely separate pair — created once, lazily, for the lifetime of
  // this component (a fresh setupId prop change on an already-mounted SplitSetupView, i.e.
  // picking a *different* second setup while already split, isn't wired yet; the toolbar's Split
  // View button is disabled while splitActive, so that path doesn't exist yet either — see
  // SetupToolbar.tsx). loadForSetup inside SetupEditorPane's own load effect populates it exactly
  // like any normal setup open.
  const [rightStores] = useState(() => {
    const setupStoreApi = createSetupStore()
    const layoutStoreApi = createLayoutStore(setupStoreApi)
    return { setupStoreApi, layoutStoreApi }
  })

  const [activePane, setActivePane] = useState<'left' | 'right'>('left')
  const [ratio, setRatio] = useState(DEFAULT_RATIO)
  const [closing, setClosing] = useState(false)
  const ratioSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load the persisted split ratio once on mount.
  useEffect(() => {
    window.api.settings.get(APP_SETTINGS_KEYS.splitViewRatio).then((raw) => {
      const parsed = raw ? Number(raw) : NaN
      if (Number.isFinite(parsed) && parsed >= MIN_RATIO && parsed <= MAX_RATIO) setRatio(parsed)
    })
  }, [])

  function persistRatio(next: number): void {
    if (ratioSaveTimer.current) clearTimeout(ratioSaveTimer.current)
    ratioSaveTimer.current = setTimeout(() => {
      void window.api.settings.set(APP_SETTINGS_KEYS.splitViewRatio, String(next))
    }, RATIO_SAVE_DELAY_MS)
  }

  function handleRatioChange(next: number): void {
    setRatio(next)
    persistRatio(next)
  }

  function flushRatioNow(): void {
    if (ratioSaveTimer.current) clearTimeout(ratioSaveTimer.current)
    void window.api.settings.set(APP_SETTINGS_KEYS.splitViewRatio, String(ratio))
  }

  // Both panes must flush before collapsing back to single view — same-realm (both stores live
  // in this renderer process), so plain sequential awaits. No IPC/handshake/timeout dance like
  // the pop-out window's requestFlush needs — that machinery exists solely because that feature
  // crosses a process boundary.
  async function handleClose(): Promise<void> {
    setClosing(true)
    try {
      const leftSetupState = useSetupStore.getState()
      if (leftSetupState.isDirty) await leftSetupState.save()
      const leftLayoutState = useLayoutStore.getState()
      if (leftLayoutState.isDirty) await leftLayoutState.save()

      const rightSetupState = rightStores.setupStoreApi.getState()
      if (rightSetupState.isDirty) await rightSetupState.save()
      const rightLayoutState = rightStores.layoutStoreApi.getState()
      if (rightLayoutState.isDirty) await rightLayoutState.save()

      closeSplitView()
    } finally {
      setClosing(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        className="nav-crumbs"
        style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <button onClick={onBackToHome}>Home</button> / Split View
        </div>
        <button className="btn" onClick={handleClose} disabled={closing}>
          {closing ? 'Closing…' : 'Close Split View'}
        </button>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div
          style={{ flexBasis: `${ratio * 100}%`, minWidth: 0, display: 'flex', flexDirection: 'column' }}
          onMouseDownCapture={() => setActivePane('left')}
        >
          <SetupEditorPane
            buildingId={buildingId}
            studioId={studioId}
            setupId={leftSetupId}
            mode={leftMode}
            onModeChange={onLeftModeChange}
            paneActive={activePane === 'left'}
          />
        </div>
        <SplitDivider onRatioChange={handleRatioChange} onDragEnd={flushRatioNow} />
        <div
          style={{ flexBasis: `${(1 - ratio) * 100}%`, minWidth: 0, display: 'flex', flexDirection: 'column' }}
          onMouseDownCapture={() => setActivePane('right')}
        >
          <SetupStoreProvider store={rightStores.setupStoreApi}>
            <LayoutStoreProvider store={rightStores.layoutStoreApi}>
              <SetupEditorPane
                buildingId={buildingId}
                studioId={studioId}
                setupId={rightSetupId}
                mode={rightMode}
                onModeChange={setRightMode}
                paneActive={activePane === 'right'}
              />
            </LayoutStoreProvider>
          </SetupStoreProvider>
        </div>
      </div>
      <Toast />
    </div>
  )
}
