import { useEffect, useMemo, useState } from 'react'
import type { Mic, MicWithStudio, OutboardGear, OutboardGearWithStudio } from '@shared/types/entities'
import { guessManufacturer, MANUFACTURER_PREFIXES } from '@shared/constants/manufacturers'
import { stripManufacturerPrefix } from '@shared/utils/manufacturerPrefix'
import { useNavigationStore } from '@renderer/state/navigationStore'
import { useFolderPicker, NEW_FOLDER_VALUE, NO_FOLDER_VALUE } from '@renderer/state/useFolderPicker'
import { indentedFolderLabel } from '@renderer/state/folderTree'
import { useModelSuggestions } from '@renderer/state/useModelSuggestions'
import ManufacturerPickerDropdown from '@renderer/components/ManufacturerPickerDropdown'
import ImportGearModal from './ImportGearModal'
import LayoutFileUploader from '../StudioAdminEditor/LayoutFileUploader'

interface PendingItem {
  key: string
  existingId?: number
  name: string
  manufacturer: string | null
  category: string | null
  quantity: number
}

function tempKey(): string {
  return `new-${crypto.randomUUID()}`
}

/** Collapses the "every studio's gear" catalogue down to one entry per distinct piece of equipment,
 *  since this picker is choosing a type of gear to add, not a specific studio's physical unit. */
function dedupeByNameAndManufacturer<T extends { name: string; manufacturer: string | null }>(items: T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of items) {
    const key = `${item.manufacturer?.trim().toLowerCase() ?? ''}::${item.name.trim().toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

interface ManualEntryFormProps {
  onAdd: (name: string, manufacturer: string | null, quantity: number) => void
  namePlaceholder: string
  formId: string
  manufacturerSuggestions: string[]
  catalogueItems: { name: string; manufacturer: string | null }[]
}

function ManualEntryForm({
  onAdd,
  namePlaceholder,
  formId,
  manufacturerSuggestions,
  catalogueItems
}: ManualEntryFormProps): JSX.Element {
  const [name, setName] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [quantity, setQuantity] = useState('1')
  const datalistId = `manufacturer-suggestions-${formId}`
  const modelDatalistId = `model-suggestions-${formId}`
  const modelSuggestions = useModelSuggestions(catalogueItems, manufacturer)

  function handleAdd(): void {
    if (!name.trim()) return
    const trimmedManufacturer = manufacturer.trim() || null
    const finalName = trimmedManufacturer ? stripManufacturerPrefix(name.trim(), trimmedManufacturer) : name.trim()
    onAdd(finalName, trimmedManufacturer, Math.max(1, Number(quantity) || 1))
    setName('')
    setManufacturer('')
    setQuantity('1')
  }

  function handleNameBlur(): void {
    if (!manufacturer.trim() && name.trim()) {
      setManufacturer(guessManufacturer(name) ?? '')
    }
  }

  return (
    <div className="inline-form" style={{ marginTop: 8 }}>
      <input
        placeholder="Manufacturer"
        value={manufacturer}
        onChange={(e) => setManufacturer(e.target.value)}
        list={datalistId}
      />
      <datalist id={datalistId}>
        {manufacturerSuggestions.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <input
        placeholder={namePlaceholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleNameBlur}
        list={modelDatalistId}
      />
      <datalist id={modelDatalistId}>
        {modelSuggestions.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <input
        type="number"
        min={1}
        style={{ width: 70 }}
        title="Quantity"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
      />
      <button className="btn" onClick={handleAdd} disabled={!name.trim()}>
        + Add Manually
      </button>
    </div>
  )
}

export default function StudioSetupPage(): JSX.Element {
  const studioSetupId = useNavigationStore((s) => s.studioSetupId)
  const goToHome = useNavigationStore((s) => s.goToHome)

  const isEditing = studioSetupId != null

  const [name, setName] = useState('Untitled Studio')
  const [pendingMics, setPendingMics] = useState<PendingItem[]>([])
  const [pendingOutboard, setPendingOutboard] = useState<PendingItem[]>([])
  const [removedMicIds, setRemovedMicIds] = useState<Set<number>>(new Set())
  const [removedOutboardIds, setRemovedOutboardIds] = useState<Set<number>>(new Set())
  // allMics/allOutboard (studio-tagged) feed the "Import Gear from Another Studio" modal;
  // micCatalogueSource/outboardCatalogueSource are the comprehensive every-pool lists (studio
  // lockers, building pools, faculty reserve, personal, setup-scoped) feeding the "Add from
  // Catalogue" dropdowns — origin deliberately doesn't matter there.
  const [allMics, setAllMics] = useState<MicWithStudio[]>([])
  const [allOutboard, setAllOutboard] = useState<OutboardGearWithStudio[]>([])
  const [micCatalogueSource, setMicCatalogueSource] = useState<Mic[]>([])
  const [outboardCatalogueSource, setOutboardCatalogueSource] = useState<OutboardGear[]>([])
  const [saving, setSaving] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  // Set the first time a brand-new studio gets a row created early — purely so the Room Layout
  // button has a studioId to attach the upload to before the user has clicked "Save Studio".
  // Never set when editing an existing studio (studioSetupId already covers that case).
  const [createdStudioId, setCreatedStudioId] = useState<number | null>(null)
  const [creatingForLayout, setCreatingForLayout] = useState(false)
  const activeStudioId = studioSetupId ?? createdStudioId

  const { folderOptions, selection, setSelection, newFolderName, setNewFolderName, resolveFolderId } =
    useFolderPicker()

  const catalogueMics = dedupeByNameAndManufacturer(micCatalogueSource)
  const catalogueOutboard = dedupeByNameAndManufacturer(outboardCatalogueSource)

  const catalogueManufacturers = useMemo(() => {
    const set = new Set<string>()
    for (const m of micCatalogueSource) if (m.manufacturer) set.add(m.manufacturer.trim())
    for (const o of outboardCatalogueSource) if (o.manufacturer) set.add(o.manufacturer.trim())
    for (const p of MANUFACTURER_PREFIXES) set.add(p)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [micCatalogueSource, outboardCatalogueSource])

  useEffect(() => {
    window.api.mics.listAllWithStudio().then(setAllMics)
    window.api.outboard.listAllWithStudio().then(setAllOutboard)
    window.api.mics.listAll().then(setMicCatalogueSource)
    window.api.outboard.listAll().then(setOutboardCatalogueSource)
    setCreatedStudioId(null)

    if (studioSetupId != null) {
      window.api.studios.get(studioSetupId).then((studio) => {
        if (!studio) return
        setName(studio.name)
        setSelection(studio.folderId != null ? String(studio.folderId) : NO_FOLDER_VALUE)
      })
      window.api.mics.listStudioMics(studioSetupId).then((mics) =>
        setPendingMics(
          mics.map((m) => ({
            key: `existing-mic-${m.id}`,
            existingId: m.id,
            name: m.name,
            manufacturer: m.manufacturer,
            category: m.category,
            quantity: m.quantity
          }))
        )
      )
      window.api.outboard.listByStudio(studioSetupId).then((gear) =>
        setPendingOutboard(
          gear.map((g) => ({
            key: `existing-outboard-${g.id}`,
            existingId: g.id,
            name: g.name,
            manufacturer: g.manufacturer,
            category: g.category,
            quantity: g.quantity
          }))
        )
      )
    } else {
      setName('Untitled Studio')
      setPendingMics([])
      setPendingOutboard([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioSetupId])

  function addMic(id: number | null): void {
    const source = micCatalogueSource.find((m) => m.id === id)
    if (!source) return
    setPendingMics((prev) => [
      ...prev,
      {
        key: tempKey(),
        name: source.name,
        manufacturer: source.manufacturer,
        category: source.category,
        quantity: source.quantity
      }
    ])
  }

  function addOutboard(id: number | null): void {
    const source = outboardCatalogueSource.find((o) => o.id === id)
    if (!source) return
    setPendingOutboard((prev) => [
      ...prev,
      {
        key: tempKey(),
        name: source.name,
        manufacturer: source.manufacturer,
        category: source.category,
        quantity: source.quantity
      }
    ])
  }

  function handleImportGear(micIds: number[], outboardIds: number[]): void {
    for (const id of micIds) addMic(id)
    for (const id of outboardIds) addOutboard(id)
  }

  function addManualMic(itemName: string, manufacturer: string | null, quantity: number): void {
    setPendingMics((prev) => [...prev, { key: tempKey(), name: itemName, manufacturer, category: null, quantity }])
  }

  function addManualOutboard(itemName: string, manufacturer: string | null, quantity: number): void {
    setPendingOutboard((prev) => [...prev, { key: tempKey(), name: itemName, manufacturer, category: null, quantity }])
  }

  function removeMic(item: PendingItem): void {
    setPendingMics((prev) => prev.filter((m) => m.key !== item.key))
    if (item.existingId != null) setRemovedMicIds((prev) => new Set(prev).add(item.existingId!))
  }

  function removeOutboard(item: PendingItem): void {
    setPendingOutboard((prev) => prev.filter((o) => o.key !== item.key))
    if (item.existingId != null) setRemovedOutboardIds((prev) => new Set(prev).add(item.existingId!))
  }

  function updateMic(key: string, patch: Partial<PendingItem>): void {
    setPendingMics((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)))
  }

  function updateOutboard(key: string, patch: Partial<PendingItem>): void {
    setPendingOutboard((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)))
  }

  // Creates the studio row early if it doesn't exist yet, so the Room Layout button has a real
  // studioId to attach an upload to before the user has clicked "Save Studio". Returns null if
  // there's no name yet to create with. Editing an existing studio always short-circuits to its
  // real id; nothing is created twice.
  async function ensureStudioExists(): Promise<number | null> {
    if (activeStudioId) return activeStudioId
    if (!name.trim()) return null
    const folderId = await resolveFolderId()
    const created = await window.api.studios.createCustom(name.trim(), folderId)
    setCreatedStudioId(created.id)
    return created.id
  }

  async function handleUploadLayoutBeforeSave(): Promise<void> {
    setCreatingForLayout(true)
    try {
      const id = await ensureStudioExists()
      if (!id) return
      await window.api.layoutFile.importForStudio(id)
    } finally {
      setCreatingForLayout(false)
    }
  }

  // If a studio row was created early purely to back the Room Layout button and the user backs
  // out without ever clicking "Save Studio", delete it — otherwise it'd linger as an empty,
  // gearless studio. Editing an existing studio never hits this (createdStudioId stays null).
  async function handleCancel(): Promise<void> {
    if (createdStudioId) await window.api.studios.remove(createdStudioId)
    goToHome()
  }

  async function handleSave(): Promise<void> {
    if (!name.trim()) return
    setSaving(true)
    try {
      const folderId = await resolveFolderId()

      const studioId = activeStudioId
        ? (await window.api.studios.updateCustomDetails(activeStudioId, name.trim(), folderId)).id
        : (await window.api.studios.createCustom(name.trim(), folderId)).id

      for (const id of removedMicIds) await window.api.mics.remove(id)
      for (const id of removedOutboardIds) await window.api.outboard.remove(id)

      for (const item of pendingMics) {
        await window.api.mics.upsert({
          id: item.existingId,
          poolType: 'studio',
          studioId,
          buildingId: null,
          setupId: null,
          name: item.name,
          manufacturer: item.manufacturer,
          category: item.category,
          notes: null,
          quantity: item.quantity
        })
      }
      for (const item of pendingOutboard) {
        await window.api.outboard.upsert({
          id: item.existingId,
          poolType: 'studio',
          studioId,
          buildingId: null,
          setupId: null,
          name: item.name,
          manufacturer: item.manufacturer,
          category: item.category,
          notes: null,
          quantity: item.quantity
        })
      }

      goToHome()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
      <div className="nav-crumbs" style={{ padding: '10px 16px 0' }}>
        <button onClick={handleCancel}>Home</button> / {isEditing ? 'Edit Studio' : 'New Studio'}
      </div>

      <div className="top-bar" style={{ borderTop: '1px solid var(--color-border)' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text)',
            fontSize: 14,
            fontWeight: 600
          }}
        />
        <select value={selection} onChange={(e) => setSelection(e.target.value)} style={{ maxWidth: 200 }}>
          <option value={NO_FOLDER_VALUE}>No folder</option>
          {folderOptions.map(({ folder, depth }) => (
            <option key={folder.id} value={folder.id}>
              {indentedFolderLabel(folder.name, depth)}
            </option>
          ))}
          <option value={NEW_FOLDER_VALUE}>+ Create new folder…</option>
        </select>
        {selection === NEW_FOLDER_VALUE && (
          <input
            placeholder="New folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            style={{ maxWidth: 180 }}
            autoFocus
          />
        )}
        <div className="spacer" />
        <button className="btn" onClick={handleCancel}>
          Cancel
        </button>
        <button className="btn primary" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save Studio'}
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <button className="btn" style={{ marginBottom: 16 }} onClick={() => setImportModalOpen(true)}>
          Import Gear from Another Studio…
        </button>

        <div className="section-title" style={{ marginTop: 0 }}>
          Room Layout
        </div>
        {activeStudioId ? (
          <LayoutFileUploader studioId={activeStudioId} />
        ) : (
          <div>
            <div className="empty-state">No room layout uploaded for this studio yet.</div>
            <div className="inline-form">
              <button
                className="btn primary"
                onClick={handleUploadLayoutBeforeSave}
                disabled={!name.trim() || creatingForLayout}
              >
                {creatingForLayout ? 'Uploading…' : 'Upload Layout File'}
              </button>
            </div>
          </div>
        )}

        <div className="section-title">Mics</div>
        <ManufacturerPickerDropdown
          items={catalogueMics}
          usageCounts={new Map()}
          getQuantity={(m) => m.quantity}
          selectedId={null}
          onSelect={addMic}
          placeholder="+ Add Mic from Catalogue"
          showUsage={false}
        />
        <ManualEntryForm
          onAdd={addManualMic}
          namePlaceholder="Mic name (e.g. Neumann U87)"
          formId="mic"
          manufacturerSuggestions={catalogueManufacturers}
          catalogueItems={catalogueMics}
        />
        {pendingMics.length > 0 && (
          <table className="data-table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Manufacturer</th>
                <th>Qty</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingMics.map((item) => (
                <tr key={item.key}>
                  <td>
                    <input value={item.name} onChange={(e) => updateMic(item.key, { name: e.target.value })} />
                  </td>
                  <td>
                    <input
                      value={item.manufacturer ?? ''}
                      onChange={(e) => updateMic(item.key, { manufacturer: e.target.value || null })}
                    />
                  </td>
                  <td style={{ maxWidth: 70 }}>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateMic(item.key, { quantity: Math.max(1, Number(e.target.value)) })}
                    />
                  </td>
                  <td>
                    <button className="btn small danger" onClick={() => removeMic(item)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="section-title">Outboard Gear</div>
        <ManufacturerPickerDropdown
          items={catalogueOutboard}
          usageCounts={new Map()}
          getQuantity={(o) => o.quantity}
          selectedId={null}
          onSelect={addOutboard}
          placeholder="+ Add Outboard from Catalogue"
          showUsage={false}
        />
        <ManualEntryForm
          onAdd={addManualOutboard}
          namePlaceholder="Gear name (e.g. 1176 Compressor)"
          formId="outboard"
          manufacturerSuggestions={catalogueManufacturers}
          catalogueItems={catalogueOutboard}
        />
        {pendingOutboard.length > 0 && (
          <table className="data-table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Manufacturer</th>
                <th>Qty</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingOutboard.map((item) => (
                <tr key={item.key}>
                  <td>
                    <input value={item.name} onChange={(e) => updateOutboard(item.key, { name: e.target.value })} />
                  </td>
                  <td>
                    <input
                      value={item.manufacturer ?? ''}
                      onChange={(e) => updateOutboard(item.key, { manufacturer: e.target.value || null })}
                    />
                  </td>
                  <td style={{ maxWidth: 70 }}>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateOutboard(item.key, { quantity: Math.max(1, Number(e.target.value)) })}
                    />
                  </td>
                  <td>
                    <button className="btn small danger" onClick={() => removeOutboard(item)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {importModalOpen && (
        <ImportGearModal
          allMics={allMics}
          allOutboard={allOutboard}
          currentStudioId={studioSetupId}
          onImport={handleImportGear}
          onClose={() => setImportModalOpen(false)}
        />
      )}
    </div>
  )
}
