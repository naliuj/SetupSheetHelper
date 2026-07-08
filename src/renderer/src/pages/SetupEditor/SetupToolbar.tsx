import { useEffect, useState } from 'react'
import type Konva from 'konva'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import type { MenuAction, PdfExportInclude } from '@shared/types/ipc'
import { useSetupStore } from '@renderer/state/setupStore'
import { useLayoutStore } from '@renderer/state/layoutStore'
import type { EditorMode } from '@renderer/state/navigationStore'
import { exportStageToDataUrl } from './canvas/konvaExport'
import SaveAsTemplateModal from './SaveAsTemplateModal'
import SetupGearLocker from './SetupGearLocker'
import ExportOptionsModal from './ExportOptionsModal'
import { useBufferedField } from './table/useBufferedField'
import { GENERIC_INSTRUMENT_TYPE } from './table/AddSourceControl'

interface Props {
  stageRef: React.RefObject<Konva.Stage | null>
  mode: EditorMode
  onToggleMode: (mode: EditorMode) => void
}

export default function SetupToolbar({ stageRef, mode, onToggleMode }: Props): JSX.Element {
  const setupId = useSetupStore((s) => s.setupId)
  const name = useSetupStore((s) => s.name)
  const sessionDate = useSetupStore((s) => s.sessionDate)
  const engineer = useSetupStore((s) => s.engineer)
  const artist = useSetupStore((s) => s.artist)
  const setName = useSetupStore((s) => s.setName)
  const setSessionDate = useSetupStore((s) => s.setSessionDate)
  const setEngineer = useSetupStore((s) => s.setEngineer)
  const setArtist = useSetupStore((s) => s.setArtist)
  const save = useSetupStore((s) => s.save)
  const isDirty = useSetupStore((s) => s.isDirty)
  const isSaving = useSetupStore((s) => s.isSaving)
  const addItem = useSetupStore((s) => s.addItem)
  const selectedItemIds = useSetupStore((s) => s.selectedItemIds)
  const removeItems = useSetupStore((s) => s.removeItems)
  const setSequentialNumberingOpen = useSetupStore((s) => s.setSequentialNumberingOpen)

  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [gearLockerOpen, setGearLockerOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [defaultExportInclude, setDefaultExportInclude] = useState<PdfExportInclude>('both')

  const nameField = useBufferedField(name, setName)
  const sessionDateField = useBufferedField(sessionDate ?? '', (v) => setSessionDate(v || null))
  const engineerField = useBufferedField(engineer ?? '', (v) => setEngineer(v || null))
  const artistField = useBufferedField(artist ?? '', (v) => setArtist(v || null))

  async function handleSave(): Promise<void> {
    await save()
  }

  async function handleExport(): Promise<void> {
    setExportMessage(null)
    const remembered = await window.api.settings.get(APP_SETTINGS_KEYS.defaultPdfExportInclude)
    setDefaultExportInclude(remembered === 'sheet' || remembered === 'layout' ? remembered : 'both')
    setExportModalOpen(true)
  }

  async function performExport(include: PdfExportInclude): Promise<void> {
    setExporting(true)
    setExportMessage(null)
    try {
      await save()
      await useLayoutStore.getState().save()
      const currentSetupId = useSetupStore.getState().setupId
      if (!currentSetupId) return

      // Skip flattening the canvas entirely for a sheet-only export — no need to pay for it.
      let dataUrl: string | null = null
      if (include !== 'sheet' && stageRef.current) {
        useLayoutStore.getState().selectBlock(null)
        // let the deselect re-render (hides the resize/rotate handles) before flattening the stage
        await new Promise((resolve) => setTimeout(resolve, 30))
        dataUrl = exportStageToDataUrl(stageRef.current, 2)
      }

      if (include === 'layout' && !dataUrl) {
        setExportMessage('Switch to Layout Mode first — there\'s no room layout to export yet.')
        return
      }

      const result = await window.api.exportPdf.exportSetup({
        setupId: currentSetupId,
        layoutImageDataUrl: dataUrl,
        include
      })
      setExportMessage(result.canceled ? null : `Exported to ${result.filePath}`)
      if (!result.canceled) {
        await window.api.settings.set(APP_SETTINGS_KEYS.defaultPdfExportInclude, include)
      }
    } finally {
      setExporting(false)
    }
  }

  async function handleSaveAsTemplate(templateName: string, folderId: number | null): Promise<void> {
    await save()
    const setupId = useSetupStore.getState().setupId
    if (!setupId) return
    await window.api.setups.saveAsTemplate({ setupId, name: templateName, folderId })
  }

  // These actions live in the native File/Edit menus (Save Setup / Save as Studio / Export
  // PDF / Toggle Mode / Add Source / Delete Selected Row / Open Session Gear) instead of
  // toolbar buttons — this listener only exists while a setup is open, so the menu items are
  // harmless no-ops from any other screen. Re-subscribes on `mode`/`selectedItemIds` change so
  // the toggle and delete cases always act on current state, not a stale value captured at
  // mount.
  useEffect(() => {
    return window.api.menu.onAction((action: MenuAction) => {
      switch (action) {
        case 'save-setup':
          handleSave()
          break
        case 'save-as-studio':
          setTemplateModalOpen(true)
          break
        case 'export-pdf':
          handleExport()
          break
        case 'toggle-mode':
          onToggleMode(mode === 'table' ? 'layout' : 'table')
          break
        case 'add-source':
          addItem(GENERIC_INSTRUMENT_TYPE, { sourceName: 'Untitled Source' })
          break
        case 'delete-row':
          if (selectedItemIds.size > 0) removeItems([...selectedItemIds])
          break
        case 'sequential-numbering':
          if (mode === 'table') setSequentialNumberingOpen(true)
          break
        case 'open-session-gear':
          setGearLockerOpen(true)
          break
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedItemIds])

  return (
    <div className="top-bar" style={{ borderTop: '1px solid var(--color-border)' }}>
      <input
        value={nameField.value}
        onChange={(e) => nameField.onChange(e.target.value)}
        onBlur={nameField.onBlur}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text)',
          fontSize: 14,
          fontWeight: 600
        }}
      />
      <input
        type="date"
        value={sessionDateField.value}
        onChange={(e) => sessionDateField.onChange(e.target.value)}
        onBlur={sessionDateField.onBlur}
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
          borderRadius: 4,
          padding: '4px 6px'
        }}
      />
      <input
        placeholder="Engineer"
        value={engineerField.value}
        onChange={(e) => engineerField.onChange(e.target.value)}
        onBlur={engineerField.onBlur}
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
          borderRadius: 4,
          padding: '4px 6px',
          width: 120
        }}
      />
      <input
        placeholder="Artist"
        value={artistField.value}
        onChange={(e) => artistField.onChange(e.target.value)}
        onBlur={artistField.onBlur}
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
          borderRadius: 4,
          padding: '4px 6px',
          width: 120
        }}
      />
      <div className="spacer" />
      {exportMessage && <span className="card-sub">{exportMessage}</span>}
      {isDirty && <span className="card-sub">Unsaved changes</span>}
      {isSaving && <span className="card-sub">Saving…</span>}
      {exporting && <span className="card-sub">Exporting…</span>}
      {setupId && (
        <button className="btn" onClick={() => setGearLockerOpen(true)}>
          Session Gear
        </button>
      )}
      <button className="btn" onClick={() => onToggleMode(mode === 'table' ? 'layout' : 'table')}>
        {mode === 'table' ? 'Layout Mode' : 'Table Mode'}
      </button>
      {templateModalOpen && (
        <SaveAsTemplateModal onClose={() => setTemplateModalOpen(false)} onSave={handleSaveAsTemplate} />
      )}
      {gearLockerOpen && setupId && (
        <SetupGearLocker setupId={setupId} onClose={() => setGearLockerOpen(false)} />
      )}
      {exportModalOpen && (
        <ExportOptionsModal
          defaultInclude={defaultExportInclude}
          onClose={() => setExportModalOpen(false)}
          onExport={performExport}
        />
      )}
    </div>
  )
}
