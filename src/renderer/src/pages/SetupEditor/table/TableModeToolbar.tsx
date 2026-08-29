import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useSetupStoreState } from '@renderer/state/setupStoreContext'
import { useKeybindPrefsStore } from '@renderer/state/keybindPrefsStore'
import { formatCombo } from '@shared/constants/keybindActions'
import Icon from '@renderer/components/Icon'
import ColumnOrderList from '@renderer/components/ColumnOrderList'
import LoadPresetModal from '../../PresetManager/LoadPresetModal'
import ManagePresetsModal from '../../PresetManager/ManagePresetsModal'
import { GENERIC_INSTRUMENT_TYPE } from './tableConstants'

/** Persistent Table Mode toolbar — creation and global controls only. Row-scoped actions (number,
 *  save-as-preset, delete) live in the contextual SelectionActionBar instead. */
export default function TableModeToolbar(): JSX.Element {
  const addItem = useSetupStoreState((s) => s.addItem)
  const outboardColumnCount = useSetupStoreState((s) => s.outboardColumnCount)
  const addOutboardColumn = useSetupStoreState((s) => s.addOutboardColumn)
  const removeOutboardColumn = useSetupStoreState((s) => s.removeOutboardColumn)
  const visibleColumns = useSetupStoreState((s) => s.visibleColumns)
  const setColumnVisibility = useSetupStoreState((s) => s.setColumnVisibility)
  const columnOrder = useSetupStoreState((s) => s.columnOrder)
  const setColumnOrder = useSetupStoreState((s) => s.setColumnOrder)
  const resetColumnsToDefault = useSetupStoreState((s) => s.resetColumnsToDefault)
  const resolveKeybind = useKeybindPrefsStore((s) => s.resolve)

  const [sourceName, setSourceName] = useState('')
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [loadPresetOpen, setLoadPresetOpen] = useState(false)
  const [managePresetsOpen, setManagePresetsOpen] = useState(false)
  const presetsRef = useRef<HTMLDivElement>(null)
  const columnsRef = useRef<HTMLDivElement>(null)

  function handleAdd(): void {
    addItem(GENERIC_INSTRUMENT_TYPE, { sourceName: sourceName.trim() })
    setSourceName('')
  }

  // Close the Presets menu on an outside click.
  useEffect(() => {
    if (!presetsOpen) return
    function onDown(e: MouseEvent): void {
      if (presetsRef.current && !presetsRef.current.contains(e.target as Node)) setPresetsOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [presetsOpen])

  // Close the Columns menu on an outside click.
  useEffect(() => {
    if (!columnsOpen) return
    function onDown(e: MouseEvent): void {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) setColumnsOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [columnsOpen])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px 0' }}>
      <Icon name="plus" size={16} style={{ color: 'var(--color-text-dim)' }} />
      <input
        placeholder="Add a source (e.g. Lead Vocal, Kick In) — press Enter"
        value={sourceName}
        onChange={(e) => setSourceName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        style={{
          flex: 1,
          padding: '8px 10px',
          borderRadius: 6,
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg)',
          color: 'var(--color-text)'
        }}
      />
      <button className="btn primary" onClick={handleAdd} title={formatCombo(resolveKeybind('add-source'))}>
        Add source
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Outboard columns">
        <button
          className="btn small"
          onClick={removeOutboardColumn}
          disabled={outboardColumnCount <= 1}
          aria-label="Remove outboard column"
        >
          <Icon name="minus" size={14} />
        </button>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-dim)' }}>
          <Icon name="columns" size={15} /> {outboardColumnCount}
        </span>
        <button className="btn small" onClick={addOutboardColumn} aria-label="Add outboard column">
          <Icon name="plus" size={14} />
        </button>
      </div>

      <div ref={columnsRef} style={{ position: 'relative' }}>
        <button
          className="btn"
          onClick={() => setColumnsOpen((v) => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name="columns" size={15} /> Columns <Icon name="chevron-down" size={14} />
        </button>
        {columnsOpen && (
          <div
            className="picker-menu"
            style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, minWidth: 220, padding: 10 }}
          >
            <div className="card-sub" style={{ margin: '0 0 8px' }}>
              Columns in this setup — drag to reorder
            </div>
            <ColumnOrderList
              order={columnOrder}
              visible={visibleColumns}
              onReorder={setColumnOrder}
              onToggle={setColumnVisibility}
            />
            {/* A real button behind a separator, not a bare full-width click target — it used to
                sit flush under the last toggle (Polarity), where a misclick silently restored
                every hidden column. */}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
              <button className="btn small inline-icon-text" onClick={() => resetColumnsToDefault()}>
                <RotateCcw size={13} aria-hidden="true" /> Reset to my defaults
              </button>
            </div>
          </div>
        )}
      </div>

      <div ref={presetsRef} style={{ position: 'relative' }}>
        <button
          className="btn"
          onClick={() => setPresetsOpen((v) => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name="bookmark" size={15} /> Presets <Icon name="chevron-down" size={14} />
        </button>
        {presetsOpen && (
          <div className="picker-menu" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, minWidth: 180 }}>
            <div
              className="picker-menu-row"
              onClick={() => {
                setPresetsOpen(false)
                setLoadPresetOpen(true)
              }}
            >
              Load preset…
            </div>
            <div
              className="picker-menu-row"
              onClick={() => {
                setPresetsOpen(false)
                setManagePresetsOpen(true)
              }}
            >
              Manage presets…
            </div>
          </div>
        )}
      </div>

      {loadPresetOpen && <LoadPresetModal onClose={() => setLoadPresetOpen(false)} />}
      {managePresetsOpen && <ManagePresetsModal onClose={() => setManagePresetsOpen(false)} />}
    </div>
  )
}
