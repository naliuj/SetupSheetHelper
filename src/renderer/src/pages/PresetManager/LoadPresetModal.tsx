import { useEffect, useState } from 'react'
import type { ChannelPreset } from '@shared/types/channelPreset'
import { useCatalogStore } from '@renderer/state/catalogStore'
import { useSetupStore } from '@renderer/state/setupStore'
import { resolveChannelPresetItems } from '@renderer/state/channelPresetResolution'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

export default function LoadPresetModal({ onClose }: { onClose: () => void }): JSX.Element {
  useEscapeToClose(onClose)
  const mics = useCatalogStore((s) => s.mics)
  const outboardGear = useCatalogStore((s) => s.outboardGear)
  const preamps = useCatalogStore((s) => s.preamps)
  const applyChannelPreset = useSetupStore((s) => s.applyChannelPreset)

  const [presets, setPresets] = useState<ChannelPreset[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    window.api.presets.list().then((list) => {
      setPresets(list)
      if (list.length > 0) setSelectedId(list[0].id)
    })
  }, [])

  async function handleLoad(): Promise<void> {
    if (!selectedId) return
    const preset = await window.api.presets.getWithItems(selectedId)
    if (!preset) return
    const resolved = resolveChannelPresetItems(preset.items, mics, outboardGear, preamps)
    applyChannelPreset(resolved)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
        <h2 style={{ marginTop: 0 }}>Load Channel Preset</h2>

        {presets.length === 0 ? (
          <div className="empty-state">No channel presets saved yet — save one from an open setup.</div>
        ) : (
          <>
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              style={{ width: '100%' }}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="card-sub">
              Rows are added to the current setup. Any mic or outboard not found in this studio's catalogue is still
              added — unassigned, with a warning badge — so you can pick a replacement right in the table.
            </p>
          </>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          {presets.length > 0 && (
            <button className="btn primary" onClick={handleLoad}>
              Load
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
