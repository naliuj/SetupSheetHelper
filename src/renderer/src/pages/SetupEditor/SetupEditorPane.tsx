import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import type { EditorMode } from '@renderer/state/navigationStore'
import { useSetupStoreApi, useSetupStoreState } from '@renderer/state/setupStoreContext'
import { useLayoutStoreApi, useLayoutStoreState } from '@renderer/state/layoutStoreContext'
import { useCatalogStoreState } from '@renderer/state/catalogStoreContext'
import { useLayoutWindowStore } from '@renderer/state/layoutWindowStore'
import InstrumentPalette from './palette/InstrumentPalette'
import SetupSheetTable from './table/SetupSheetTable'
import TableModeToolbar from './table/TableModeToolbar'
import SelectionActionBar from './table/SelectionActionBar'
import SetupToolbar from './SetupToolbar'
import SetupSettingsPage from './SetupSettingsPage'

const AUTOSAVE_DELAY_MS = 1000

// Lazy so konva + react-konva + pdfjs (the app's heaviest dependencies, all reached only through
// the canvas) live in their own chunk instead of the startup bundle — app launch and Table Mode
// don't pay their parse cost. The stage still mounts (hidden) as soon as the editor opens, so
// PDF export's stageRef capture keeps working exactly as before.
const LayoutStage = lazy(() => import('./canvas/LayoutStage'))

interface Props {
  /** null for custom (buildingless) studios. */
  buildingId: number | null
  studioId: number
  setupId: number | null
  mode: EditorMode
  onModeChange: (mode: EditorMode) => void
  /** False when this pane isn't the active one in Split View — gates its keybind dispatch (menu
   *  actions + keydown, in SetupToolbar.tsx and LayoutStage.tsx) so Cmd+Z, delete, duplicate,
   *  arrow-nudge, etc. only ever affect whichever pane the user last interacted with. Always
   *  true outside Split View (the only caller there passes the default). */
  paneActive: boolean
}

/** One setup, fully loaded/editable/autosaving — the whole body of what used to be SetupEditor.tsx
 *  before Split View, extracted so it can be instantiated twice (once per pane) instead of once.
 *  Reads its identity (buildingId/studioId/setupId) and mode as CONTROLLED PROPS rather than
 *  pulling them off navigationStore directly — navigationStore only tracks the left/primary pane
 *  (setupId/editorMode) plus the right pane's identity (splitSetupId/splitEditorMode); this
 *  component doesn't care which one it's rendering, that's the caller's job (SetupEditor.tsx for
 *  the single-pane case, SplitSetupView.tsx for both panes in split view).
 *
 *  Deliberately does NOT render <Toast /> — that reads from a single global toastStore (never
 *  split per-pane, unlike setupStore/layoutStore), so mounting it here would double-render the
 *  same toast in split view. The caller renders one <Toast /> at whatever wrapping level makes
 *  sense for it (SetupEditor.tsx in single-pane mode, SplitSetupView.tsx once for both panes). */
export default function SetupEditorPane({
  buildingId,
  studioId,
  setupId,
  mode,
  onModeChange,
  paneActive
}: Props): JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)

  const setupStoreApi = useSetupStoreApi()
  const layoutStoreApi = useLayoutStoreApi()

  const startNewSetup = useSetupStoreState((s) => s.startNewSetup)
  const loadFromSetup = useSetupStoreState((s) => s.loadFromSetup)
  const loadLayoutBlocks = useLayoutStoreState((s) => s.loadForSetup)
  const loadCatalog = useCatalogStoreState((s) => s.loadForStudio)

  const items = useSetupStoreState((s) => s.items)
  const name = useSetupStoreState((s) => s.name)
  const sessionDate = useSetupStoreState((s) => s.sessionDate)
  const engineer = useSetupStoreState((s) => s.engineer)
  const artist = useSetupStoreState((s) => s.artist)
  const facultyReserveEnabled = useSetupStoreState((s) => s.facultyReserveEnabled)
  const isDirty = useSetupStoreState((s) => s.isDirty)
  const save = useSetupStoreState((s) => s.save)

  const layoutBlocks = useLayoutStoreState((s) => s.blocks)
  const layoutIsDirty = useLayoutStoreState((s) => s.isDirty)
  const saveLayout = useLayoutStoreState((s) => s.save)

  const stageRef = useRef<Konva.Stage>(null)

  // True while this exact setup's layout is open in the standalone Layout Mode window — see
  // layoutWindowStore.ts. Drives two things below: skipping the local LayoutStage mount (it has
  // nothing to show; the popped-out window is the only editor) and the load effect not pulling
  // this setup's blocks into the local layoutStore at all, since nothing here will render or edit
  // them and the popped-out window is the sole writer.
  const layoutPoppedOut = useLayoutWindowStore((s) => setupId != null && s.openForSetupId === setupId)

  // The main window's local layoutStore was never told to load this setup's blocks while it was
  // popped out (see the load effect below), and the standalone window is the sole writer for as
  // long as that's true — so the moment it closes (or retargets to a different setup), this
  // window's own copy is either empty or stale relative to whatever got saved over there. Refetch
  // right on that false-transition rather than waiting for some other reason to reload.
  const wasLayoutPoppedOutRef = useRef(false)
  useEffect(() => {
    if (wasLayoutPoppedOutRef.current && !layoutPoppedOut && setupId) {
      loadLayoutBlocks(setupId)
    }
    wasLayoutPoppedOutRef.current = layoutPoppedOut
  }, [layoutPoppedOut, setupId, loadLayoutBlocks])

  // Persists the setup's own mode choice, independent of any other setup, so reopening it later
  // restores this exact view instead of whatever mode was last used elsewhere.
  function handleToggleMode(newMode: EditorMode): void {
    onModeChange(newMode)
    if (setupId) window.api.setups.setLastEditorMode(setupId, newMode)
  }

  // Whether the setup itself has finished loading into the store — gates the catalog load below
  // so it doesn't fire a full (and immediately stale) load with the store's default
  // facultyReserveEnabled before the persisted value arrives.
  const [setupLoaded, setSetupLoaded] = useState(false)

  useEffect(() => {
    if (!studioId) return
    setSetupLoaded(false)
    // Read fresh rather than depending on a reactive layoutPoppedOut: this effect intentionally
    // doesn't re-run on every push update (see the exhaustive-deps disable below), so by the
    // time it fires here it wants the latest answer, not a stale closed-over one.
    if (useLayoutWindowStore.getState().openForSetupId !== setupId) {
      loadLayoutBlocks(setupId)
    }

    if (setupId) {
      window.api.setups.getWithItems(setupId).then((setup) => {
        if (setup) {
          loadFromSetup(setup)
          // A setup whose lastEditorMode was 'layout' before it got popped out would otherwise
          // reopen this pane straight into a blank/unmounted Layout Mode — snap to Table instead
          // when its layout is currently owned by the other window.
          const poppedOut = useLayoutWindowStore.getState().openForSetupId === setup.id
          onModeChange(poppedOut ? 'table' : setup.lastEditorMode)
        }
        setSetupLoaded(true)
      })
    } else {
      window.api.settings.get(APP_SETTINGS_KEYS.defaultEngineerName).then((defaultEngineer) => {
        startNewSetup(
          studioId,
          'Untitled Setup',
          new Date().toISOString().slice(0, 10),
          null,
          defaultEngineer || null
        )
        onModeChange('table')
        setSetupLoaded(true)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId, buildingId, setupId])

  // Separate from the load effect above: re-runs whenever facultyReserveEnabled changes (not
  // just on studio/setup switch), so toggling the Setup Settings checkbox reflects in the "Add
  // from Catalogue" dropdowns immediately — no save required first. Gated on setupLoaded so a
  // setup open triggers exactly one catalog load, with the real persisted faculty flag —
  // previously it double-loaded (once with the store default, again when the setup resolved).
  useEffect(() => {
    if (!studioId || !setupLoaded) return
    loadCatalog(studioId, buildingId, setupId, facultyReserveEnabled)
  }, [studioId, buildingId, setupId, facultyReserveEnabled, setupLoaded, loadCatalog])

  // Debounced autosave: any dirty change (re)starts a short timer that saves once things
  // settle, instead of hammering a full items-table replace on every keystroke/drag. Table
  // Mode's setupStore and Layout Mode's layoutStore are fully independent, but both flush on
  // the same timer for simplicity — each only actually writes if its own isDirty is set.
  useEffect(() => {
    if (!isDirty && !layoutIsDirty) return
    const timer = setTimeout(() => {
      if (isDirty) save()
      if (layoutIsDirty) saveLayout()
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [
    items,
    name,
    sessionDate,
    engineer,
    artist,
    facultyReserveEnabled,
    isDirty,
    save,
    layoutBlocks,
    layoutIsDirty,
    saveLayout
  ])

  // Flush any pending edit immediately when this pane unmounts, so a quick navigation away right
  // after typing/dragging doesn't lose the last second of work. For the SINGLE-pane case this
  // fires on leaving the editor entirely; in Split View, SplitSetupView additionally flushes both
  // panes explicitly before collapsing back to single view (belt-and-suspenders — this effect
  // alone already covers a pane unmounting for any reason, split view's flush covers the "user
  // is about to lose the store instance entirely" case with an awaited, sequenced save first).
  useEffect(() => {
    return () => {
      const setupState = setupStoreApi.getState()
      if (setupState.isDirty) setupState.save()
      const layoutState = layoutStoreApi.getState()
      if (layoutState.isDirty) layoutState.save()
    }
  }, [setupStoreApi, layoutStoreApi])

  if (settingsOpen && setupId) {
    return <SetupSettingsPage setupId={setupId} onBack={() => setSettingsOpen(false)} />
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
      <SetupToolbar
        stageRef={stageRef}
        mode={mode}
        onToggleMode={handleToggleMode}
        onOpenSettings={() => setSettingsOpen(true)}
        layoutPoppedOut={layoutPoppedOut}
        paneActive={paneActive}
      />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: mode === 'table' || layoutPoppedOut ? 'block' : 'none'
        }}
      >
        <TableModeToolbar />
        <SelectionActionBar />
        <SetupSheetTable />
      </div>
      {/* Kept mounted (just hidden) in Table Mode, rather than unmounted, so its Konva stage stays
          available for PDF export's "room layout" capture regardless of which mode the editor is
          currently in — see performExport in SetupToolbar.tsx. Not mounted at all while this
          setup's layout is popped out: the standalone window is the sole editor and the sole
          source of that capture in that case (see requestExportImage in performExport). */}
      {!layoutPoppedOut && (
        <div style={{ flex: 1, display: mode === 'table' ? 'none' : 'flex', minHeight: 0 }}>
          <InstrumentPalette />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Suspense fallback={null}>
              <LayoutStage
                studioId={studioId}
                stageRef={stageRef}
                active={mode === 'layout'}
                paneActive={paneActive}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  )
}
