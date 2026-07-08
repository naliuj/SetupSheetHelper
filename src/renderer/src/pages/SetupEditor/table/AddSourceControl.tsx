import { useState } from 'react'
import { useSetupStore } from '@renderer/state/setupStore'
import SequentialNumberingModal from './SequentialNumberingModal'
import SaveChannelPresetModal from './SaveChannelPresetModal'
import LoadPresetModal from '../../PresetManager/LoadPresetModal'

export const GENERIC_INSTRUMENT_TYPE = 'custom_source'

export default function AddSourceControl(): JSX.Element {
  const [sourceName, setSourceName] = useState('')
  const addItem = useSetupStore((s) => s.addItem)
  const sequentialNumberingOpen = useSetupStore((s) => s.sequentialNumberingOpen)
  const setSequentialNumberingOpen = useSetupStore((s) => s.setSequentialNumberingOpen)
  const saveChannelPresetOpen = useSetupStore((s) => s.saveChannelPresetOpen)
  const setSaveChannelPresetOpen = useSetupStore((s) => s.setSaveChannelPresetOpen)
  const [loadPresetOpen, setLoadPresetOpen] = useState(false)

  function handleAdd(): void {
    if (!sourceName.trim()) return
    addItem(GENERIC_INSTRUMENT_TYPE, { sourceName: sourceName.trim() })
    setSourceName('')
  }

  return (
    <div className="inline-form" style={{ marginTop: 0, padding: '12px 12px 0' }}>
      <input
        placeholder="Source name (e.g. Lead Vocal, Kick In)"
        value={sourceName}
        onChange={(e) => setSourceName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
      />
      <button className="btn primary" onClick={handleAdd}>
        + Add Source
      </button>
      <button className="btn" onClick={() => setSequentialNumberingOpen(true)}>
        Sequential Numbering…
      </button>
      <button className="btn" onClick={() => setSaveChannelPresetOpen(true)}>
        Save Channel Preset…
      </button>
      <button className="btn" onClick={() => setLoadPresetOpen(true)}>
        Load Channel Preset…
      </button>
      {sequentialNumberingOpen && <SequentialNumberingModal onClose={() => setSequentialNumberingOpen(false)} />}
      {saveChannelPresetOpen && <SaveChannelPresetModal onClose={() => setSaveChannelPresetOpen(false)} />}
      {loadPresetOpen && <LoadPresetModal onClose={() => setLoadPresetOpen(false)} />}
    </div>
  )
}
