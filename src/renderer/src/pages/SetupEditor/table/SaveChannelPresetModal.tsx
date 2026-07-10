import { useState } from 'react'
import type { ChannelPresetItemInput } from '@shared/types/channelPreset'
import { useSetupStore } from '@renderer/state/setupStore'
import { useCatalogStore } from '@renderer/state/catalogStore'

type IncludeField = 'mic' | 'outboard' | 'preamp' | 'channel' | 'tieLine' | 'cueBox' | 'polarity' | 'notes'

const FIELD_LABELS: Record<IncludeField, string> = {
  mic: 'Mic',
  outboard: 'Outboard',
  preamp: 'Preamp',
  channel: 'Channel',
  tieLine: 'Tie Line',
  cueBox: 'Cue Box',
  polarity: 'Polarity',
  notes: 'Notes'
}

const DEFAULT_INCLUDED: Record<IncludeField, boolean> = {
  mic: true,
  outboard: true,
  preamp: true,
  channel: false,
  tieLine: false,
  cueBox: false,
  polarity: false,
  notes: false
}

/** Captures the selected rows (or every row, when nothing is selected — same convention as
 *  Sequential Numbering) into a reusable Channel Preset, with a save-time choice of which
 *  fields to include. Skipped fields are simply left out of the captured row (null), same as
 *  any other unset field. */
export default function SaveChannelPresetModal({ onClose }: { onClose: () => void }): JSX.Element {
  const items = useSetupStore((s) => s.items)
  const selectedItemIds = useSetupStore((s) => s.selectedItemIds)
  const mics = useCatalogStore((s) => s.mics)
  const outboardGear = useCatalogStore((s) => s.outboardGear)
  const preamps = useCatalogStore((s) => s.preamps)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [included, setIncluded] = useState(DEFAULT_INCLUDED)
  const [saving, setSaving] = useState(false)

  const targetItems = selectedItemIds.size > 0 ? items.filter((item) => selectedItemIds.has(item.id)) : items

  function toggleField(field: IncludeField): void {
    setIncluded((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  async function handleSave(): Promise<void> {
    if (!name.trim() || targetItems.length === 0) return
    setSaving(true)
    try {
      const presetItems: ChannelPresetItemInput[] = targetItems.map((item) => {
        const mic = included.mic && item.micId != null ? mics.find((m) => m.id === item.micId) : null
        // Presets stay single-outboard (a reusable "typical chain") — only the row's first
        // outboard slot is ever captured, even if the row has more.
        const slot0OutboardId = item.outboards.find((s) => s.slotIndex === 0)?.outboardId ?? null
        const outboard =
          included.outboard && slot0OutboardId != null ? outboardGear.find((g) => g.id === slot0OutboardId) : null
        const preamp =
          included.preamp && item.preampId != null ? preamps.find((p) => p.id === item.preampId) : null
        return {
          instrumentType: item.instrumentType,
          sourceName: item.sourceName,
          micName: mic?.name ?? null,
          micManufacturer: mic?.manufacturer ?? null,
          outboardName: outboard?.name ?? null,
          outboardManufacturer: outboard?.manufacturer ?? null,
          preampName: preamp?.name ?? null,
          preampManufacturer: preamp?.manufacturer ?? null,
          channel: included.channel ? item.channel : null,
          tieLine: included.tieLine ? item.tieLine : null,
          cueBox: included.cueBox ? item.cueBox : null,
          polarityFlip: included.polarity ? item.polarityFlip : null,
          notes: included.notes ? item.notes : null
        }
      })
      await window.api.presets.create({ name: name.trim(), description: description.trim() || null, items: presetItems })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <h2 style={{ marginTop: 0 }}>Save Channel Preset</h2>
        <p className="card-sub" style={{ marginTop: 0 }}>
          {selectedItemIds.size > 0
            ? `${targetItems.length} selected row${targetItems.length === 1 ? '' : 's'}`
            : `All ${targetItems.length} row${targetItems.length === 1 ? '' : 's'}`}
        </p>

        <input
          placeholder="Preset name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', marginBottom: 8 }}
          autoFocus
        />
        <input
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ width: '100%', marginBottom: 12 }}
        />

        <div className="section-title" style={{ marginTop: 0 }}>
          Fields to include
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr', rowGap: 6, columnGap: 8 }}>
          {(Object.keys(FIELD_LABELS) as IncludeField[]).map((field) => (
            <label key={field} style={{ display: 'contents', cursor: 'pointer' }}>
              <input type="checkbox" checked={included[field]} onChange={() => toggleField(field)} />
              <span>{FIELD_LABELS[field]}</span>
            </label>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleSave} disabled={saving || !name.trim() || targetItems.length === 0}>
            {saving ? 'Saving…' : 'Save Preset'}
          </button>
        </div>
      </div>
    </div>
  )
}
