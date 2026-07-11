import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { useNavigationStore } from '@renderer/state/navigationStore'
import { useSetupStore } from '@renderer/state/setupStore'
import { useLayoutStore } from '@renderer/state/layoutStore'
import { useCatalogStore } from '@renderer/state/catalogStore'
import InstrumentPalette from './palette/InstrumentPalette'
import LayoutStage from './canvas/LayoutStage'
import SetupSheetTable from './table/SetupSheetTable'
import TableModeToolbar from './table/TableModeToolbar'
import SelectionActionBar from './table/SelectionActionBar'
import SetupToolbar from './SetupToolbar'
import SetupSettingsPage from './SetupSettingsPage'

const AUTOSAVE_DELAY_MS = 1000

export default function SetupEditor(): JSX.Element {
  const buildingId = useNavigationStore((s) => s.buildingId)
  const studioId = useNavigationStore((s) => s.studioId)
  const setupId = useNavigationStore((s) => s.setupId)
  const goToHome = useNavigationStore((s) => s.goToHome)
  const mode = useNavigationStore((s) => s.editorMode)
  const setMode = useNavigationStore((s) => s.setEditorMode)

  const [settingsOpen, setSettingsOpen] = useState(false)

  const startNewSetup = useSetupStore((s) => s.startNewSetup)
  const loadFromSetup = useSetupStore((s) => s.loadFromSetup)
  const loadLayoutBlocks = useLayoutStore((s) => s.loadForSetup)
  const loadCatalog = useCatalogStore((s) => s.loadForStudio)

  const items = useSetupStore((s) => s.items)
  const name = useSetupStore((s) => s.name)
  const sessionDate = useSetupStore((s) => s.sessionDate)
  const engineer = useSetupStore((s) => s.engineer)
  const artist = useSetupStore((s) => s.artist)
  const facultyReserveEnabled = useSetupStore((s) => s.facultyReserveEnabled)
  const isDirty = useSetupStore((s) => s.isDirty)
  const save = useSetupStore((s) => s.save)

  const layoutBlocks = useLayoutStore((s) => s.blocks)
  const layoutIsDirty = useLayoutStore((s) => s.isDirty)
  const saveLayout = useLayoutStore((s) => s.save)

  const stageRef = useRef<Konva.Stage>(null)

  useEffect(() => {
    if (!studioId) return
    loadLayoutBlocks(setupId)

    if (setupId) {
      window.api.setups.getWithItems(setupId).then((setup) => {
        if (setup) loadFromSetup(setup)
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
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId, buildingId, setupId])

  // Separate from the load effect above: re-runs whenever facultyReserveEnabled changes (not
  // just on studio/setup switch), so toggling the Setup Settings checkbox reflects in the "Add
  // from Catalogue" dropdowns immediately — no save required first. Also naturally re-fires
  // once loadFromSetup (above) populates the real persisted value shortly after mount, since
  // it starts as the store's default before that resolves.
  useEffect(() => {
    if (!studioId) return
    loadCatalog(studioId, buildingId, setupId, facultyReserveEnabled)
  }, [studioId, buildingId, setupId, facultyReserveEnabled, loadCatalog])

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

  // Flush any pending edit immediately when leaving the editor, so a quick navigation away
  // right after typing/dragging doesn't lose the last second of work.
  useEffect(() => {
    return () => {
      const setupState = useSetupStore.getState()
      if (setupState.isDirty) setupState.save()
      const layoutState = useLayoutStore.getState()
      if (layoutState.isDirty) layoutState.save()
    }
  }, [])

  if (!studioId) {
    return (
      <div className="page">
        <div className="empty-state">No studio selected.</div>
      </div>
    )
  }

  if (settingsOpen && setupId) {
    return <SetupSettingsPage setupId={setupId} onBack={() => setSettingsOpen(false)} />
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
      <div className="nav-crumbs" style={{ padding: '10px 16px 0' }}>
        <button onClick={goToHome}>Home</button> / Setup Editor
      </div>
      <SetupToolbar
        stageRef={stageRef}
        mode={mode}
        onToggleMode={setMode}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: mode === 'table' ? 'block' : 'none' }}>
        <TableModeToolbar />
        <SelectionActionBar />
        <SetupSheetTable />
      </div>
      {/* Kept mounted (just hidden) in Table Mode, rather than unmounted, so its Konva stage
          stays available for PDF export's "room layout" capture regardless of which mode the
          editor is currently in — see performExport in SetupToolbar.tsx. */}
      <div style={{ flex: 1, display: mode === 'table' ? 'none' : 'flex', minHeight: 0 }}>
        <InstrumentPalette />
        <div style={{ flex: 1, minWidth: 0 }}>
          <LayoutStage studioId={studioId} stageRef={stageRef} />
        </div>
      </div>
    </div>
  )
}
