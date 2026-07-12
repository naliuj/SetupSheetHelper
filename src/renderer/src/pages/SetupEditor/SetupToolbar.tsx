import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import type { MenuAction, PdfExportInclude } from '@shared/types/ipc'
import { KEYBIND_ACTIONS, formatCombo, normalizeKeyEvent } from '@shared/constants/keybindActions'
import { useSetupStore } from '@renderer/state/setupStore'
import { useLayoutStore } from '@renderer/state/layoutStore'
import { useKeybindPrefsStore } from '@renderer/state/keybindPrefsStore'
import { useNavigationStore, type EditorMode } from '@renderer/state/navigationStore'
import { exportStageToDataUrl } from './canvas/konvaExport'
import SaveAsTemplateModal from './SaveAsTemplateModal'
import ExportOptionsModal, { type ExportOptions } from './ExportOptionsModal'
import RequireLayoutFileModal from './RequireLayoutFileModal'
import { useBufferedField } from './table/useBufferedField'
import { GENERIC_INSTRUMENT_TYPE } from './table/tableConstants'

interface Props {
  stageRef: React.RefObject<Konva.Stage | null>
  mode: EditorMode
  onToggleMode: (mode: EditorMode) => void
  onOpenSettings: () => void
}

export default function SetupToolbar({ stageRef, mode, onToggleMode, onOpenSettings }: Props): JSX.Element {
  const setupId = useSetupStore((s) => s.setupId)
  const studioId = useSetupStore((s) => s.studioId)
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
  const duplicateItems = useSetupStore((s) => s.duplicateItems)
  const clearSelection = useSetupStore((s) => s.clearSelection)
  const focusNumbering = useSetupStore((s) => s.focusNumbering)
  const selectedBlockIds = useLayoutStore((s) => s.selectedBlockIds)
  const removeBlocks = useLayoutStore((s) => s.removeBlocks)
  const duplicateBlocks = useLayoutStore((s) => s.duplicateBlocks)
  const selectBlock = useLayoutStore((s) => s.selectBlock)

  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [defaultExportInclude, setDefaultExportInclude] = useState<PdfExportInclude>('both')
  const [defaultExportColoredRows, setDefaultExportColoredRows] = useState(false)
  const [layoutGateOpen, setLayoutGateOpen] = useState(false)

  const resolveKeybind = useKeybindPrefsStore((s) => s.resolve)
  const goToSettings = useNavigationStore((s) => s.goToSettings)

  const nameField = useBufferedField(name, setName)
  const sessionDateField = useBufferedField(sessionDate ?? '', (v) => setSessionDate(v || null))
  const engineerField = useBufferedField(engineer ?? '', (v) => setEngineer(v || null))
  const artistField = useBufferedField(artist ?? '', (v) => setArtist(v || null))

  // Transient "✓ Saved" confirmation: today Saving… / Unsaved changes just vanish on success with
  // no positive confirmation autosave landed. Fires on the isSaving true->false edge (only when
  // the save actually succeeded, i.e. nothing re-dirtied it in the meantime), then self-clears.
  const [justSaved, setJustSaved] = useState(false)
  const wasSavingRef = useRef(false)
  useEffect(() => {
    if (wasSavingRef.current && !isSaving && !isDirty) {
      setJustSaved(true)
      const timer = setTimeout(() => setJustSaved(false), 2000)
      wasSavingRef.current = isSaving
      return () => clearTimeout(timer)
    }
    wasSavingRef.current = isSaving
  }, [isSaving, isDirty])
  // A fresh edit while the "Saved" confirmation is still showing should replace it with "Unsaved
  // changes" immediately, rather than showing both at once for the rest of the 2s window.
  useEffect(() => {
    if (isDirty) setJustSaved(false)
  }, [isDirty])

  async function handleSave(): Promise<void> {
    await save()
  }

  async function handleExport(): Promise<void> {
    setExportMessage(null)
    const [remembered, rememberedColoredRows] = await Promise.all([
      window.api.settings.get(APP_SETTINGS_KEYS.defaultPdfExportInclude),
      window.api.settings.get(APP_SETTINGS_KEYS.defaultPdfExportColoredRows)
    ])
    setDefaultExportInclude(remembered === 'sheet' || remembered === 'layout' ? remembered : 'both')
    setDefaultExportColoredRows(rememberedColoredRows === '1')
    setExportModalOpen(true)
  }

  async function performExport({ include, coloredRows, orientation, density }: ExportOptions): Promise<void> {
    setExporting(true)
    setExportMessage(null)
    try {
      await save()
      await useLayoutStore.getState().save()
      const currentSetupId = useSetupStore.getState().setupId
      if (!currentSetupId) return

      // Skip flattening the canvas entirely for a sheet-only export — no need to pay for it.
      // The layout stage now stays mounted (just visually hidden) even in Table Mode, so
      // capturing it no longer requires switching modes first — but it can still be genuinely
      // empty if this studio has no room layout file assigned at all, which is what actually
      // needs checking here (stageRef.current itself is basically always populated now).
      let dataUrl: string | null = null
      if (include !== 'sheet' && stageRef.current) {
        const layout = studioId ? await window.api.layoutFile.getForStudio(studioId) : null
        if (layout) {
          useLayoutStore.getState().selectBlock(null)
          // let the deselect re-render (hides the resize/rotate handles) before flattening the stage
          await new Promise((resolve) => setTimeout(resolve, 30))
          dataUrl = exportStageToDataUrl(stageRef.current, 2)
        }
      }

      if (include === 'layout' && !dataUrl) {
        setExportMessage('This studio has no room layout assigned yet — nothing to export.')
        return
      }

      const result = await window.api.exportPdf.exportSetup({
        setupId: currentSetupId,
        layoutImageDataUrl: dataUrl,
        include,
        coloredRows,
        orientation,
        density
      })
      setExportMessage(result.canceled ? null : `Exported to ${result.filePath}`)
      if (!result.canceled) {
        await window.api.settings.set(APP_SETTINGS_KEYS.defaultPdfExportInclude, include)
        await window.api.settings.set(APP_SETTINGS_KEYS.defaultPdfExportColoredRows, coloredRows ? '1' : '0')
      }
    } catch (err) {
      setExportMessage(`Export failed — ${err instanceof Error ? err.message : 'please try again.'}`)
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

  // Cmd/Ctrl+Z(+Shift) is claimed by our own Undo/Redo menu items (see below), so a focused
  // text field no longer gets native in-field text undo for free the way it would under
  // Electron's `role: 'undo'` — replicate it explicitly via execCommand before falling back
  // to the app-level history, so an in-progress edit still undoes character-by-character.
  function handleUndoRedo(direction: 'undo' | 'redo'): void {
    const active = document.activeElement
    const isTextEditable =
      active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active as HTMLElement)?.isContentEditable
    if (isTextEditable) {
      document.execCommand(direction)
      return
    }
    if (mode === 'table') {
      useSetupStore.temporal.getState()[direction]()
      useSetupStore.setState({ isDirty: true })
    } else {
      useLayoutStore.temporal.getState()[direction]()
      useLayoutStore.setState({ isDirty: true })
    }
  }

  // Cmd/Ctrl+A is claimed by our own menu item (same reasoning as handleUndoRedo above) — a
  // focused text field would otherwise lose native "select all text in this field" behavior,
  // so replicate it explicitly before falling back to selecting every row in Table Mode.
  function handleSelectAll(): void {
    const active = document.activeElement
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      active.select()
      return
    }
    if ((active as HTMLElement)?.isContentEditable) {
      document.execCommand('selectAll')
      return
    }
    if (mode === 'table') {
      useSetupStore.getState().selectAll()
    } else if (mode === 'layout') {
      useLayoutStore.getState().selectAllBlocks()
    }
  }

  // Layout Mode requires a room layout file to be assigned to the studio first — leaving
  // Layout Mode is always allowed, but entering it checks for one and, if missing, opens a
  // blocking prompt instead of switching.
  async function requestToggleMode(): Promise<void> {
    if (mode === 'layout') {
      onToggleMode('table')
      return
    }
    const layout = studioId ? await window.api.layoutFile.getForStudio(studioId) : null
    if (layout) onToggleMode('layout')
    else setLayoutGateOpen(true)
  }

  // One handler per rebindable action (see KEYBIND_ACTIONS), shared by both dispatch paths below:
  // the native menu's mouse-click IPC message, and the keyboard shortcut matcher. `open-settings`
  // isn't here — it's handled in App.tsx since it must work from any screen, not just inside an
  // open setup. Recreated each render (cheap) so both effects' closures see current state without
  // needing every dependency spelled out per-key.
  const handlers: Record<string, () => void> = {
    'save-setup': handleSave,
    'save-as-studio': () => setTemplateModalOpen(true),
    'export-pdf': handleExport,
    'toggle-mode': requestToggleMode,
    'add-source': () => addItem(GENERIC_INSTRUMENT_TYPE, { sourceName: 'Untitled Source' }),
    'select-all': handleSelectAll,
    'delete-selection': () => {
      if (mode === 'table' && selectedItemIds.size > 0) removeItems([...selectedItemIds])
      else if (mode === 'layout' && selectedBlockIds.size > 0) removeBlocks([...selectedBlockIds])
    },
    'duplicate-selection': () => {
      if (mode === 'layout' && selectedBlockIds.size > 0) duplicateBlocks([...selectedBlockIds])
      else if (mode === 'table' && selectedItemIds.size > 0) duplicateItems([...selectedItemIds])
    },
    'sequential-numbering': () => {
      if (mode === 'table') focusNumbering()
    },
    'zoom-in': () => {
      if (mode === 'layout') useLayoutStore.getState().zoomIn()
    },
    'zoom-out': () => {
      if (mode === 'layout') useLayoutStore.getState().zoomOut()
    },
    'reset-view': () => {
      if (mode === 'layout') useLayoutStore.getState().resetView()
    },
    'open-setup-settings': onOpenSettings,
    undo: () => handleUndoRedo('undo'),
    redo: () => handleUndoRedo('redo'),
    'clear-selection': () => {
      if (mode === 'table') clearSelection()
      else selectBlock(null)
    },
    'delete-selection-table': () => {
      if (mode === 'table' && selectedItemIds.size > 0) removeItems([...selectedItemIds])
    },
    'delete-selection-layout': () => {
      if (mode === 'layout' && selectedBlockIds.size > 0) removeBlocks([...selectedBlockIds])
    }
  }

  // Mouse-click path: the native menu's items still send these over IPC when clicked — this
  // listener only exists while a setup is open, so the menu items are harmless no-ops from any
  // other screen. The menu no longer carries live `accelerator`s (see menu.ts and the Settings →
  // Keybinds tab), so this switch only fires from an actual click now, never a keypress.
  useEffect(() => {
    return window.api.menu.onAction((action: MenuAction) => {
      handlers[action]?.()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedItemIds, selectedBlockIds, studioId, onOpenSettings])

  // Keyboard path: matches every KEYBIND_ACTIONS entry (except open-settings, see above) against
  // its user-configured (or default) combo. isTextField bails out before matching ANY action —
  // this is a deliberate behavior change from the old native-accelerator Cmd/Ctrl+Backspace,
  // which used to fire even mid-edit in a text field (Electron accelerators can't see DOM focus);
  // routing it through here instead makes it respect text-field focus like bare Delete already
  // did, which is strictly safer. Undo/Redo/Select All specifically WANT to no-op here while a
  // text field is focused, since without a native accelerator claiming the key, the browser's own
  // built-in text-field undo/redo/select-all behavior applies for free — see handleUndoRedo/
  // handleSelectAll's own comments for the mouse-click-path half of that story.
  useEffect(() => {
    function isTextField(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (isTextField(e.target)) return
      const combo = normalizeKeyEvent(e)
      if (!combo) return
      const { resolve } = useKeybindPrefsStore.getState()
      for (const action of KEYBIND_ACTIONS) {
        if (action.id === 'open-settings') continue
        if (action.scope === 'table' && mode !== 'table') continue
        if (action.scope === 'layout' && mode !== 'layout') continue
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedItemIds, selectedBlockIds, studioId, onOpenSettings])

  return (
    <div className="top-bar" style={{ borderTop: '1px solid var(--color-border)' }}>
      <input
        aria-label="Setup name"
        value={nameField.value}
        onChange={(e) => nameField.onChange(e.target.value)}
        onBlur={nameField.onBlur}
        className="setup-name-input"
      />
      <input
        aria-label="Session date"
        type="date"
        value={sessionDateField.value}
        onChange={(e) => sessionDateField.onChange(e.target.value)}
        onBlur={sessionDateField.onBlur}
        className="setup-meta-input"
      />
      <input
        aria-label="Engineer"
        placeholder="Engineer"
        value={engineerField.value}
        onChange={(e) => engineerField.onChange(e.target.value)}
        onBlur={engineerField.onBlur}
        className="setup-meta-input"
      />
      <input
        aria-label="Artist"
        placeholder="Artist"
        value={artistField.value}
        onChange={(e) => artistField.onChange(e.target.value)}
        onBlur={artistField.onBlur}
        className="setup-meta-input"
      />
      <div className="spacer" />
      {exportMessage && <span className="card-sub">{exportMessage}</span>}
      {isDirty && <span className="card-sub">Unsaved changes</span>}
      {isSaving && <span className="card-sub">Saving…</span>}
      {!isSaving && !isDirty && justSaved && <span className="card-sub">✓ Saved</span>}
      {exporting && <span className="card-sub">Exporting…</span>}
      {setupId && (
        <button className="btn" onClick={onOpenSettings}>
          Setup settings
        </button>
      )}
      <button className="btn" onClick={requestToggleMode} title={formatCombo(resolveKeybind('toggle-mode'))}>
        {mode === 'table' ? 'Layout Mode' : 'Table Mode'}
      </button>
      <button
        className="btn"
        onClick={() => goToSettings('keybinds')}
        title="Keyboard shortcuts"
        aria-label="Keyboard shortcuts"
      >
        ⌨
      </button>
      {templateModalOpen && (
        <SaveAsTemplateModal onClose={() => setTemplateModalOpen(false)} onSave={handleSaveAsTemplate} />
      )}
      {exportModalOpen && (
        <ExportOptionsModal
          defaultInclude={defaultExportInclude}
          defaultColoredRows={defaultExportColoredRows}
          onClose={() => setExportModalOpen(false)}
          onExport={performExport}
        />
      )}
      {layoutGateOpen && studioId && (
        <RequireLayoutFileModal
          studioId={studioId}
          onUploaded={() => {
            setLayoutGateOpen(false)
            onToggleMode('layout')
          }}
          onCancel={() => setLayoutGateOpen(false)}
        />
      )}
    </div>
  )
}
