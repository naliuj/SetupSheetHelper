import { useNavigationStore } from '@renderer/state/navigationStore'
import SetupEditorPane from './SetupEditorPane'
import SplitSetupView from './SplitSetupView'
import Toast from '@renderer/components/Toast'

/** Top-level dispatcher for the Setup Editor. Reads navigationStore (the single source of truth
 *  for "which setup is open") and either renders one SetupEditorPane (the normal case) or, once
 *  Split View is active, hands off entirely to SplitSetupView — mirroring the same early-return
 *  pattern this codebase already uses for full-page detours (see the Settings page's own early
 *  return, one level down inside SetupEditorPane). The actual load/autosave/render logic for a
 *  single setup lives in SetupEditorPane now, not here — this file only owns "which pane(s), in
 *  what arrangement." */
export default function SetupEditor(): JSX.Element {
  const buildingId = useNavigationStore((s) => s.buildingId)
  const studioId = useNavigationStore((s) => s.studioId)
  const setupId = useNavigationStore((s) => s.setupId)
  const splitSetupId = useNavigationStore((s) => s.splitSetupId)
  const goToHome = useNavigationStore((s) => s.goToHome)
  const mode = useNavigationStore((s) => s.editorMode)
  const setMode = useNavigationStore((s) => s.setEditorMode)

  if (!studioId) {
    return (
      <div className="page">
        <div className="empty-state">No studio selected.</div>
      </div>
    )
  }

  if (splitSetupId != null) {
    return (
      <SplitSetupView
        buildingId={buildingId}
        studioId={studioId}
        leftSetupId={setupId}
        rightSetupId={splitSetupId}
        leftMode={mode}
        onLeftModeChange={setMode}
        onBackToHome={goToHome}
      />
    )
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
      <div className="nav-crumbs" style={{ padding: '10px 16px 0' }}>
        <button onClick={goToHome}>Home</button> / Setup Editor
      </div>
      <SetupEditorPane
        buildingId={buildingId}
        studioId={studioId}
        setupId={setupId}
        mode={mode}
        onModeChange={setMode}
        paneActive
      />
      <Toast />
    </div>
  )
}
