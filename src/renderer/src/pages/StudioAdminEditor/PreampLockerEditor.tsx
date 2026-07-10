import { useEffect, useState } from 'react'
import type { Preamp } from '@shared/types/entities'
import { guessManufacturer } from '@shared/constants/manufacturers'

export default function PreampLockerEditor({ studioId }: { studioId: number }): JSX.Element {
  const [preamps, setPreamps] = useState<Preamp[]>([])
  const [name, setName] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [category, setCategory] = useState('')
  const [channels, setChannels] = useState('1')

  function reload(): void {
    window.api.preamps.listByStudio(studioId).then(setPreamps)
  }

  useEffect(reload, [studioId])

  function handleNameBlur(): void {
    if (!manufacturer.trim() && name.trim()) {
      setManufacturer(guessManufacturer(name) ?? '')
    }
  }

  async function add(): Promise<void> {
    if (!name.trim()) return
    await window.api.preamps.upsert({
      poolType: 'studio',
      studioId,
      buildingId: null,
      setupId: null,
      name: name.trim(),
      manufacturer: manufacturer.trim() || null,
      category: category.trim() || null,
      notes: null,
      channels: Math.max(1, Number(channels) || 1)
    })
    setName('')
    setManufacturer('')
    setCategory('')
    setChannels('1')
    reload()
  }

  async function updateChannels(preamp: Preamp, newChannels: number): Promise<void> {
    await window.api.preamps.upsert({ ...preamp, channels: Math.max(1, newChannels) })
    reload()
  }

  async function updateManufacturer(preamp: Preamp, newManufacturer: string): Promise<void> {
    await window.api.preamps.upsert({ ...preamp, manufacturer: newManufacturer || null })
    reload()
  }

  async function remove(id: number): Promise<void> {
    await window.api.preamps.remove(id)
    reload()
  }

  return (
    <div>
      <p className="card-sub">Preamps that belong exclusively to this studio's own locker.</p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Manufacturer</th>
            <th>Category</th>
            <th>Channels</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {preamps.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>
                <input value={p.manufacturer ?? ''} onChange={(e) => updateManufacturer(p, e.target.value)} />
              </td>
              <td>{p.category}</td>
              <td style={{ maxWidth: 70 }}>
                <input
                  type="number"
                  min={1}
                  value={p.channels}
                  onChange={(e) => updateChannels(p, Number(e.target.value))}
                />
              </td>
              <td>
                <button className="btn small danger" onClick={() => remove(p.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {preamps.length === 0 && <div className="empty-state">No preamps in this studio's locker yet.</div>}

      <div className="inline-form">
        <input
          placeholder="Preamp name (e.g. 8-channel)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
        />
        <input
          placeholder="Manufacturer"
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
        />
        <input
          placeholder="Category (optional)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <input
          type="number"
          min={1}
          style={{ width: 70 }}
          title="Channels"
          value={channels}
          onChange={(e) => setChannels(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn primary" onClick={add}>
          Add Preamp
        </button>
      </div>
    </div>
  )
}
