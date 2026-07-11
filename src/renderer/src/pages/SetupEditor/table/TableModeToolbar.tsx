import { useEffect, useRef, useState } from 'react'
import { useSetupStore } from '@renderer/state/setupStore'
import { useNavigationStore } from '@renderer/state/navigationStore'
import Icon from '@renderer/components/Icon'
import LoadPresetModal from '../../PresetManager/LoadPresetModal'
import { GENERIC_INSTRUMENT_TYPE } from './tableConstants'

/** Persistent Table Mode toolbar — creation and global controls only. Row-scoped actions (number,
 *  save-as-preset, delete) live in the contextual SelectionActionBar instead. */
export default function TableModeToolbar(): JSX.Element {
  const addItem = useSetupStore((s) => s.addItem)
  const outboardColumnCount = useSetupStore((s) => s.outboardColumnCount)
  const addOutboardColumn = useSetupStore((s) => s.addOutboardColumn)
  const removeOutboardColumn = useSetupStore((s) => s.removeOutboardColumn)
  const goToSettings = useNavigationStore((s) => s.goToSettings)

  const [sourceName, setSourceName] = useState('')
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [loadPresetOpen, setLoadPresetOpen] = useState(false)
  const presetsRef = useRef<HTMLDivElement>(null)

  function handleAdd(): void {
    addItem(GENERIC_INSTRUMENT_TYPE, { sourceName: sourceName.trim() || 'Untitled Source' })
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
      <button className="btn primary" onClick={handleAdd}>
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
                goToSettings()
              }}
            >
              Manage presets…
            </div>
          </div>
        )}
      </div>

      {loadPresetOpen && <LoadPresetModal onClose={() => setLoadPresetOpen(false)} />}
    </div>
  )
}
