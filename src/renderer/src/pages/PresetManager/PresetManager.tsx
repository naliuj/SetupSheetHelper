import { useEffect, useState } from 'react'
import type { ChannelPreset, ChannelPresetItem, ChannelPresetItemInput } from '@shared/types/channelPreset'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

function toInput(item: ChannelPresetItem): ChannelPresetItemInput {
  return {
    instrumentType: item.instrumentType,
    sourceName: item.sourceName,
    micName: item.micName,
    micManufacturer: item.micManufacturer,
    outboardName: item.outboardName,
    outboardManufacturer: item.outboardManufacturer,
    preampName: item.preampName,
    preampManufacturer: item.preampManufacturer,
    channel: item.channel,
    tieLine: item.tieLine,
    cueBox: item.cueBox,
    polarityFlip: item.polarityFlip,
    notes: item.notes
  }
}

/** Channel Presets are only ever created by capturing rows from a live setup (see
 *  SaveChannelPresetModal.tsx in Table Mode) — this page is just list/rename/delete, no
 *  hand-typed row editor. Renaming preserves the captured rows exactly, since the update IPC
 *  call takes the full item set. */
export default function PresetManager({ onBack }: { onBack: () => void }): JSX.Element {
  const [presets, setPresets] = useState<ChannelPreset[]>([])
  const [itemCounts, setItemCounts] = useState<Map<number, number>>(new Map())
  const [renaming, setRenaming] = useState<ChannelPreset | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renameDescription, setRenameDescription] = useState('')

  useEscapeToClose(() => setRenaming(null), renaming !== null)

  function reload(): void {
    window.api.presets.list().then(async (list) => {
      setPresets(list)
      const counts = new Map<number, number>()
      await Promise.all(
        list.map(async (preset) => {
          const withItems = await window.api.presets.getWithItems(preset.id)
          counts.set(preset.id, withItems?.items.length ?? 0)
        })
      )
      setItemCounts(counts)
    })
  }

  useEffect(reload, [])

  function openRename(preset: ChannelPreset): void {
    setRenaming(preset)
    setRenameName(preset.name)
    setRenameDescription(preset.description ?? '')
  }

  async function handleRename(): Promise<void> {
    if (!renaming || !renameName.trim()) return
    const withItems = await window.api.presets.getWithItems(renaming.id)
    if (!withItems) return
    await window.api.presets.update(renaming.id, {
      name: renameName.trim(),
      description: renameDescription.trim() || null,
      items: withItems.items.map(toInput)
    })
    setRenaming(null)
    reload()
  }

  async function remove(id: number): Promise<void> {
    await window.api.presets.remove(id)
    reload()
  }

  return (
    <div className="page">
      <div className="nav-crumbs">
        <button onClick={onBack}>Settings</button> / Channel Presets
      </div>
      <h2>Channel Presets</h2>
      <p className="card-sub">
        Reusable gear lists captured from a live setup's selected rows (or the whole sheet) — mic/outboard, channel
        numbers, and whichever other fields you chose to include when saving. Load one from Table Mode's "Load
        Channel Preset…" button to add its rows to the current setup.
      </p>

      <div className="list-grid">
        {presets.map((preset) => (
          <div key={preset.id} className="card">
            <div className="card-title">{preset.name}</div>
            {preset.description && <div className="card-sub">{preset.description}</div>}
            <div className="card-sub">{itemCounts.get(preset.id) ?? 0} rows</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="btn small" onClick={() => openRename(preset)}>
                Rename
              </button>
              <button className="btn small danger" onClick={() => remove(preset.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {presets.length === 0 && (
        <div className="empty-state">
          No channel presets saved yet — open a setup's Table Mode and use "Save Channel Preset…" to create one.
        </div>
      )}

      {renaming && (
        <div className="modal-overlay" onClick={() => setRenaming(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 360 }}>
            <h2 style={{ marginTop: 0 }}>Rename Preset</h2>
            <input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
              autoFocus
            />
            <input
              placeholder="Description (optional)"
              value={renameDescription}
              onChange={(e) => setRenameDescription(e.target.value)}
              style={{ width: '100%' }}
            />
            <div className="modal-actions">
              <button className="btn" onClick={() => setRenaming(null)}>
                Cancel
              </button>
              <button className="btn primary" onClick={handleRename} disabled={!renameName.trim()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
