import { useEffect, useState } from 'react'
import type { Mic } from '@shared/types/entities'
import { guessManufacturer } from '@shared/constants/manufacturers'

export default function MicLockerEditor({ studioId }: { studioId: number }): JSX.Element {
  const [mics, setMics] = useState<Mic[]>([])
  const [name, setName] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [category, setCategory] = useState('')
  const [quantity, setQuantity] = useState('1')

  function reload(): void {
    window.api.mics.listStudioMics(studioId).then(setMics)
  }

  useEffect(reload, [studioId])

  function handleNameBlur(): void {
    if (!manufacturer.trim() && name.trim()) {
      setManufacturer(guessManufacturer(name) ?? '')
    }
  }

  async function add(): Promise<void> {
    if (!name.trim()) return
    await window.api.mics.upsert({
      poolType: 'studio',
      studioId,
      buildingId: null,
      setupId: null,
      name: name.trim(),
      manufacturer: manufacturer.trim() || null,
      category: category.trim() || null,
      notes: null,
      quantity: Math.max(1, Number(quantity) || 1)
    })
    setName('')
    setManufacturer('')
    setCategory('')
    setQuantity('1')
    reload()
  }

  function patchMic(id: number, patch: Partial<Mic>): void {
    setMics((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  async function updateQuantity(mic: Mic, newQuantity: number): Promise<void> {
    const quantity = Math.max(1, newQuantity)
    patchMic(mic.id, { quantity })
    await window.api.mics.upsert({ ...mic, quantity })
  }

  async function updateManufacturer(mic: Mic, newManufacturer: string): Promise<void> {
    const manufacturer = newManufacturer || null
    patchMic(mic.id, { manufacturer })
    await window.api.mics.upsert({ ...mic, manufacturer })
  }

  async function updateName(mic: Mic, newName: string): Promise<void> {
    if (!newName.trim()) return
    patchMic(mic.id, { name: newName })
    await window.api.mics.upsert({ ...mic, name: newName.trim() })
  }

  async function remove(id: number): Promise<void> {
    await window.api.mics.remove(id)
    reload()
  }

  return (
    <div>
      <p className="card-sub">Mics that belong exclusively to this studio's own locker.</p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Manufacturer</th>
            <th>Name</th>
            <th>Category</th>
            <th>Qty</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {mics.map((m) => (
            <tr key={m.id}>
              <td>
                <input
                  value={m.manufacturer ?? ''}
                  onChange={(e) => updateManufacturer(m, e.target.value)}
                />
              </td>
              <td>
                <input value={m.name} onChange={(e) => updateName(m, e.target.value)} />
              </td>
              <td>{m.category}</td>
              <td style={{ maxWidth: 70 }}>
                <input
                  type="number"
                  min={1}
                  value={m.quantity}
                  onChange={(e) => updateQuantity(m, Number(e.target.value))}
                />
              </td>
              <td>
                <button className="btn small danger" onClick={() => remove(m.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {mics.length === 0 && <div className="empty-state">No mics in this studio's locker yet.</div>}

      <div className="inline-form">
        <input
          placeholder="Manufacturer"
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
        />
        <input
          placeholder="Mic name (e.g. Neumann U87)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
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
          title="Quantity"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn primary" onClick={add}>
          Add Mic
        </button>
      </div>
    </div>
  )
}
