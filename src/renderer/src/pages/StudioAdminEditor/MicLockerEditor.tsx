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

  async function updateQuantity(mic: Mic, newQuantity: number): Promise<void> {
    await window.api.mics.upsert({ ...mic, quantity: Math.max(1, newQuantity) })
    reload()
  }

  async function updateManufacturer(mic: Mic, newManufacturer: string): Promise<void> {
    await window.api.mics.upsert({ ...mic, manufacturer: newManufacturer || null })
    reload()
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
            <th>Name</th>
            <th>Manufacturer</th>
            <th>Category</th>
            <th>Qty</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {mics.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>
                <input
                  value={m.manufacturer ?? ''}
                  onChange={(e) => updateManufacturer(m, e.target.value)}
                />
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
          placeholder="Mic name (e.g. Neumann U87)"
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
