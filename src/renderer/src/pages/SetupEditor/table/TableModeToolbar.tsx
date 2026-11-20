import { useEffect, useRef, useState } from 'react'
import { Layers, RotateCcw } from 'lucide-react'
import { bandRanges } from '@shared/utils/bands'
import BandOrderList from './BandOrderList'
import { useSetupStoreState } from '@renderer/state/setupStoreContext'
import { useKeybindPrefsStore } from '@renderer/state/keybindPrefsStore'
import { formatCombo } from '@shared/constants/keybindActions'
import Icon from '@renderer/components/Icon'
import ColumnOrderList from '@renderer/components/ColumnOrderList'
import ToggleSwitch from '@renderer/components/ToggleSwitch'
import { usePdfLayoutPrefsStore } from '@renderer/state/pdfLayoutPrefsStore'
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
  const items = useSetupStoreState((s) => s.items)
  const addBand = useSetupStoreState((s) => s.addBand)
  const moveBand = useSetupStoreState((s) => s.moveBand)
  const scrollToBand = useSetupStoreState((s) => s.scrollToBand)
  const focusedBand = useSetupStoreState((s) => s.focusedBand)
  const setFocusedBand = useSetupStoreState((s) => s.setFocusedBand)
  const activeBand = useSetupStoreState((s) => s.activeBand)
  const setActiveBand = useSetupStoreState((s) => s.setActiveBand)
  const addBandMenuTick = useSetupStoreState((s) => s.addBandMenuTick)
  const bands = bandRanges(items)
    .filter((r) => r.divider != null)
    .map((r) => ({
      id: String(r.divider!.id),
      label: r.divider!.sourceName.trim() || `Band ${r.index + 1}`,
      startTime: r.divider!.startTime
    }))
  const currentBand = Math.min(activeBand ?? focusedBand ?? bands.length - 1, bands.length - 1)
  const [bandsOpen, setBandsOpen] = useState(false)
  const showBandChanges = usePdfLayoutPrefsStore((s) => s.showBandChanges)
  const setShowBandChanges = usePdfLayoutPrefsStore((s) => s.setShowBandChanges)
  const [bandStep, setBandStep] = useState<'list' | 'add'>('list')
  const bandsRef = useRef<HTMLDivElement>(null)

  // The Add Band shortcut opens the menu straight on the add step.
  useEffect(() => {
    if (addBandMenuTick === 0) return
    setBandStep('add')
    setBandsOpen(true)
  }, [addBandMenuTick])

  function pickAddSource(source: number | null): void {
    setBandsOpen(false)
    addBand(source)
  }

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

  // Close the Bands menu on an outside click.
  useEffect(() => {
    if (!bandsOpen) return
    function onDown(e: MouseEvent): void {
      if (bandsRef.current && !bandsRef.current.contains(e.target as Node)) setBandsOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [bandsOpen])

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

      <div ref={bandsRef} style={{ position: 'relative' }}>
        <button
          className="btn"
          onClick={() => {
            setBandStep('list')
            setBandsOpen((v) => !v)
          }}
          aria-label="Bands"
          title={['Bands: add, reorder, or pick the one you are adding to', formatCombo(resolveKeybind('next-band'))].filter(Boolean).join(' · ')}
          aria-haspopup="menu"
          aria-expanded={bandsOpen}
          style={{ display: 'inline-flex', alignItems: 'center' }}
        >
          <Layers size={15} aria-hidden="true" />
        </button>
        {bandsOpen && (
          <div className="picker-menu" role="menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 240 }}>
            {bandStep === 'list' ? (
              <>
                {bands.length > 0 && (
                  <BandOrderList
                    bands={bands}
                    active={currentBand}
                    onPick={(band) => {
                      setActiveBand(band)
                      scrollToBand(band)
                    }}
                    onMove={moveBand}
                  />
                )}
                {bands.length > 1 && (
                  // Not a .picker-menu-row: its hover would light the whole row while only the switch clicks.
                  <div style={{ padding: '6px 8px', fontSize: 13, borderTop: '1px solid var(--color-border)' }}>
                    <ToggleSwitch checked={showBandChanges} onChange={setShowBandChanges} label="Show changes between bands" />
                  </div>
                )}
                {focusedBand != null && (
                  <div
                    className="picker-menu-row"
                    role="menuitem"
                    style={{ borderTop: '1px solid var(--color-border)' }}
                    onClick={() => {
                      setBandsOpen(false)
                      setFocusedBand(null)
                    }}
                  >
                    Show all bands
                  </div>
                )}
                <div
                  className="picker-menu-row"
                  role="menuitem"
                  // Full-width flex, not .inline-icon-text (inline-flex), so the hover fills the row.
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    ...(bands.length > 0 ? { borderTop: '1px solid var(--color-border)' } : {})
                  }}
                  onClick={() => setBandStep('add')}
                >
                  <Icon name="plus" size={14} /> Add band
                </div>
              </>
            ) : (
              <>
                <div className="card-sub" style={{ padding: '6px 10px', margin: 0 }}>
                  Start the new band from
                </div>
                {bands.length === 0 ? (
                  <div className="picker-menu-row" role="menuitem" onClick={() => pickAddSource(0)}>
                    Copy of this setup
                  </div>
                ) : (
                  [...bands.keys()].reverse().map((i) => (
                    <div key={bands[i].id} className="picker-menu-row" role="menuitem" onClick={() => pickAddSource(i)}>
                      Copy of {bands[i].label}
                    </div>
                  ))
                )}
                <div
                  className="picker-menu-row"
                  role="menuitem"
                  style={{ borderTop: '1px solid var(--color-border)' }}
                  onClick={() => pickAddSource(null)}
                >
                  Blank band
                </div>
              </>
            )}
          </div>
        )}
      </div>

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
