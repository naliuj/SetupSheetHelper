import { useEffect, useState } from 'react'
import type { OutboardGear } from '@shared/types/entities'
import { guessManufacturer } from '@shared/constants/manufacturers'

export default function OutboardEditor({ studioId }: { studioId: number }): JSX.Element {
  const [gear, setGear] = useState<OutboardGear[]>([])
  const [name, setName] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [category, setCategory] = useState('')
  const [quantity, setQuantity] = useState('1')

  function reload(): void {
    window.api.outboard.listByStudio(studioId).then(setGear)
  }

  useEffect(reload, [studioId])

  function handleNameBlur(): void {
    if (!manufacturer.trim() && name.trim()) {
      setManufacturer(guessManufacturer(name) ?? '')
    }
  }

  async function add(): Promise<void> {
    if (!name.trim()) return
    await window.api.outboard.upsert({
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

  function patchGear(id: number, patch: Partial<OutboardGear>): void {
    setGear((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  }

  async function updateQuantity(item: OutboardGear, newQuantity: number): Promise<void> {
    const quantity = Math.max(1, newQuantity)
    patchGear(item.id, { quantity })
    await window.api.outboard.upsert({ ...item, quantity })
  }

  async function updateManufacturer(item: OutboardGear, newManufacturer: string): Promise<void> {
    const manufacturer = newManufacturer || null
    patchGear(item.id, { manufacturer })
    await window.api.outboard.upsert({ ...item, manufacturer })
  }

  async function updateName(item: OutboardGear, newName: string): Promise<void> {
    if (!newName.trim()) return
    patchGear(item.id, { name: newName })
    await window.api.outboard.upsert({ ...item, name: newName.trim() })
  }

  async function remove(id: number): Promise<void> {
    await window.api.outboard.remove(id)
    reload()
  }

  return (
    <div>
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
          {gear.map((g) => (
            <tr key={g.id}>
              <td>
                <input
                  value={g.manufacturer ?? ''}
                  onChange={(e) => updateManufacturer(g, e.target.value)}
                />
              </td>
              <td>
                <input value={g.name} onChange={(e) => updateName(g, e.target.value)} />
              </td>
              <td>{g.category}</td>
              <td style={{ maxWidth: 70 }}>
                <input
                  type="number"
                  min={1}
                  value={g.quantity}
                  onChange={(e) => updateQuantity(g, Number(e.target.value))}
                />
              </td>
              <td>
                <button className="btn small danger" onClick={() => remove(g.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {gear.length === 0 && <div className="empty-state">No outboard gear yet.</div>}

      <div className="inline-form">
        <input placeholder="Manufacturer" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
        <input
          placeholder="Gear name (e.g. 1176 Compressor)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
        />
        <input placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
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
          Add Gear
        </button>
      </div>
    </div>
  )
}
