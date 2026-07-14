import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { Mic, OutboardGear, Preamp } from '@shared/types/entities'
import { guessManufacturer } from '@shared/constants/manufacturers'
import { stripManufacturerPrefix } from '@shared/utils/manufacturerPrefix'
import { useGearCatalogueSuggestions } from '@renderer/state/useGearCatalogueSuggestions'
import { useModelSuggestions } from '@renderer/state/useModelSuggestions'

function FacultyReserveMicsSection({
  manufacturerSuggestions,
  catalogueMics
}: {
  manufacturerSuggestions: string[]
  catalogueMics: Mic[]
}): JSX.Element {
  const [mics, setMics] = useState<Mic[]>([])
  const [name, setName] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [category, setCategory] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const modelSuggestions = useModelSuggestions(catalogueMics, manufacturer)

  function reload(): void {
    window.api.mics.listFacultyReserve().then(setMics)
  }

  useEffect(reload, [])

  async function handleFactoryReset(): Promise<void> {
    setResetting(true)
    try {
      await window.api.berklee.resetFacultyReserveMics()
      reload()
    } finally {
      setResetting(false)
      setConfirmResetOpen(false)
    }
  }

  function handleNameBlur(): void {
    if (!manufacturer.trim() && name.trim()) {
      setManufacturer(guessManufacturer(name) ?? '')
    }
  }

  async function add(): Promise<void> {
    if (!name.trim()) return
    const trimmedManufacturer = manufacturer.trim() || null
    const finalName = trimmedManufacturer ? stripManufacturerPrefix(name.trim(), trimmedManufacturer) : name.trim()
    await window.api.mics.upsert({
      poolType: 'faculty_reserve',
      studioId: null,
      buildingId: null,
      setupId: null,
      name: finalName,
      manufacturer: trimmedManufacturer,
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

  // Updates local state immediately (not via reload()) so rapid keystrokes can't race each
  // other's upsert+reload round trip and clobber one another — reload() re-fetches the whole
  // list, and if an earlier keystroke's reload resolves after a later one, it silently reverts
  // the field to a stale value mid-typing.
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 0 }}>
        <div className="section-title" style={{ marginTop: 0 }}>
          Mics
        </div>
        <button
          className="btn small"
          onClick={() => setConfirmResetOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <RotateCcw size={13} aria-hidden="true" /> Factory reset
        </button>
      </div>
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
                <input value={m.manufacturer ?? ''} onChange={(e) => updateManufacturer(m, e.target.value)} />
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
      {mics.length === 0 && <div className="empty-state">No faculty reserve mics yet.</div>}

      <div className="inline-form">
        <input
          placeholder="Manufacturer"
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
          list="faculty-reserve-mic-manufacturers"
        />
        <datalist id="faculty-reserve-mic-manufacturers">
          {manufacturerSuggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <input
          placeholder="Mic name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
          list="faculty-reserve-mic-models"
        />
        <datalist id="faculty-reserve-mic-models">
          {modelSuggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
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
          Add mic
        </button>
      </div>

      {confirmResetOpen && (
        <div className="modal-overlay" onClick={() => setConfirmResetOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <h2 style={{ marginTop: 0 }}>Factory reset faculty reserve mics?</h2>
            <p className="card-sub">
              Every faculty reserve mic — including any you've added or edited — is replaced with Berklee's original
              set. This can't be undone. Outboard gear and preamps in faculty reserve aren't affected.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmResetOpen(false)} disabled={resetting}>
                Cancel
              </button>
              <button className="btn danger" onClick={handleFactoryReset} disabled={resetting}>
                {resetting ? 'Resetting…' : 'Factory reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FacultyReserveOutboardSection({
  manufacturerSuggestions,
  catalogueOutboard
}: {
  manufacturerSuggestions: string[]
  catalogueOutboard: OutboardGear[]
}): JSX.Element {
  const [gear, setGear] = useState<OutboardGear[]>([])
  const [name, setName] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [category, setCategory] = useState('')
  const [quantity, setQuantity] = useState('1')
  const modelSuggestions = useModelSuggestions(catalogueOutboard, manufacturer)

  function reload(): void {
    window.api.outboard.listFacultyReserve().then(setGear)
  }

  useEffect(reload, [])

  function handleNameBlur(): void {
    if (!manufacturer.trim() && name.trim()) {
      setManufacturer(guessManufacturer(name) ?? '')
    }
  }

  async function add(): Promise<void> {
    if (!name.trim()) return
    const trimmedManufacturer = manufacturer.trim() || null
    const finalName = trimmedManufacturer ? stripManufacturerPrefix(name.trim(), trimmedManufacturer) : name.trim()
    await window.api.outboard.upsert({
      poolType: 'faculty_reserve',
      studioId: null,
      buildingId: null,
      setupId: null,
      name: finalName,
      manufacturer: trimmedManufacturer,
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
      <div className="section-title">Outboard gear</div>
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
                <input value={g.manufacturer ?? ''} onChange={(e) => updateManufacturer(g, e.target.value)} />
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
      {gear.length === 0 && <div className="empty-state">No faculty reserve outboard gear yet.</div>}

      <div className="inline-form">
        <input
          placeholder="Manufacturer"
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
          list="faculty-reserve-outboard-manufacturers"
        />
        <datalist id="faculty-reserve-outboard-manufacturers">
          {manufacturerSuggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <input
          placeholder="Gear name (e.g. 1176 Compressor)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
          list="faculty-reserve-outboard-models"
        />
        <datalist id="faculty-reserve-outboard-models">
          {modelSuggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
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
          Add gear
        </button>
      </div>
    </div>
  )
}

function FacultyReservePreampsSection({
  manufacturerSuggestions,
  cataloguePreamps
}: {
  manufacturerSuggestions: string[]
  cataloguePreamps: Preamp[]
}): JSX.Element {
  const [preamps, setPreamps] = useState<Preamp[]>([])
  const [name, setName] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [category, setCategory] = useState('')
  const [channels, setChannels] = useState('1')
  const modelSuggestions = useModelSuggestions(cataloguePreamps, manufacturer)

  function reload(): void {
    window.api.preamps.listFacultyReservePreamps().then(setPreamps)
  }

  useEffect(reload, [])

  function handleNameBlur(): void {
    if (!manufacturer.trim() && name.trim()) {
      setManufacturer(guessManufacturer(name) ?? '')
    }
  }

  async function add(): Promise<void> {
    if (!name.trim()) return
    const trimmedManufacturer = manufacturer.trim() || null
    const finalName = trimmedManufacturer ? stripManufacturerPrefix(name.trim(), trimmedManufacturer) : name.trim()
    await window.api.preamps.upsert({
      poolType: 'faculty_reserve',
      studioId: null,
      buildingId: null,
      setupId: null,
      name: finalName,
      manufacturer: trimmedManufacturer,
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

  function patchPreamp(id: number, patch: Partial<Preamp>): void {
    setPreamps((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  async function updateChannels(preamp: Preamp, newChannels: number): Promise<void> {
    const channels = Math.max(1, newChannels)
    patchPreamp(preamp.id, { channels })
    await window.api.preamps.upsert({ ...preamp, channels })
  }

  async function updateManufacturer(preamp: Preamp, newManufacturer: string): Promise<void> {
    const manufacturer = newManufacturer || null
    patchPreamp(preamp.id, { manufacturer })
    await window.api.preamps.upsert({ ...preamp, manufacturer })
  }

  async function updateName(preamp: Preamp, newName: string): Promise<void> {
    if (!newName.trim()) return
    patchPreamp(preamp.id, { name: newName })
    await window.api.preamps.upsert({ ...preamp, name: newName.trim() })
  }

  async function remove(id: number): Promise<void> {
    await window.api.preamps.remove(id)
    reload()
  }

  return (
    <div>
      <div className="section-title">Preamps</div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Manufacturer</th>
            <th>Name</th>
            <th>Category</th>
            <th>Channels</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {preamps.map((p) => (
            <tr key={p.id}>
              <td>
                <input value={p.manufacturer ?? ''} onChange={(e) => updateManufacturer(p, e.target.value)} />
              </td>
              <td>
                <input value={p.name} onChange={(e) => updateName(p, e.target.value)} />
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
      {preamps.length === 0 && <div className="empty-state">No faculty reserve preamps yet.</div>}

      <div className="inline-form">
        <input
          placeholder="Manufacturer"
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
          list="faculty-reserve-preamp-manufacturers"
        />
        <datalist id="faculty-reserve-preamp-manufacturers">
          {manufacturerSuggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <input
          placeholder="Preamp name (e.g. 8-channel)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
          list="faculty-reserve-preamp-models"
        />
        <datalist id="faculty-reserve-preamp-models">
          {modelSuggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <input placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
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
          Add preamp
        </button>
      </div>
    </div>
  )
}

export default function FacultyReserveEditor(): JSX.Element {
  const { manufacturers, mics, outboard, preamps } = useGearCatalogueSuggestions()

  return (
    <div>
      <FacultyReserveMicsSection manufacturerSuggestions={manufacturers} catalogueMics={mics} />
      <FacultyReserveOutboardSection manufacturerSuggestions={manufacturers} catalogueOutboard={outboard} />
      <FacultyReservePreampsSection manufacturerSuggestions={manufacturers} cataloguePreamps={preamps} />
    </div>
  )
}
