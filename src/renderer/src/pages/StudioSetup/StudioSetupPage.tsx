import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type {
  Mic,
  MicWithStudio,
  OutboardGear,
  OutboardGearWithStudio,
  Preamp,
  PreampWithStudio
} from '@shared/types/entities'
import { guessManufacturer, MANUFACTURER_PREFIXES } from '@shared/constants/manufacturers'
import { gearIdentityKey, stripManufacturerPrefix } from '@shared/utils/manufacturerPrefix'
import { useNavigationStore } from '@renderer/state/navigationStore'
import { useFolderPicker } from '@renderer/state/useFolderPicker'
import { useModelSuggestions } from '@renderer/state/useModelSuggestions'
import FolderPicker from '@renderer/components/FolderPicker'
import ManufacturerPickerDropdown from '@renderer/components/ManufacturerPickerDropdown'
import ImportGearModal from './ImportGearModal'
import LayoutFileUploader from '@renderer/components/LayoutFileUploader'
import SuggestInput from '@renderer/components/SuggestInput'

interface PendingItem {
  key: string
  existingId?: number
  name: string
  manufacturer: string | null
  category: string | null
  quantity: number
}

interface PendingPreampItem {
  key: string
  existingId?: number
  name: string
  manufacturer: string | null
  category: string | null
  channels: number
}

type GearTab = 'mics' | 'outboard' | 'preamps'

const GEAR_TABS: { id: GearTab; label: string }[] = [
  { id: 'mics', label: 'Mics' },
  { id: 'outboard', label: 'Outboard' },
  { id: 'preamps', label: 'Preamps' }
]

/** Files gear the way an engineer reads a locker list: manufacturer A to Z, then model within it.
 *  `numeric` so an API 512c sorts before an API 3124 instead of "3" beating "5" character by
 *  character, and a base sensitivity so "dbx" and "DBX" don't split one manufacturer into two.
 *  Blank manufacturers go last, since there is no name to file them under. */
function byManufacturerThenModel(
  a: { name: string; manufacturer: string | null },
  b: { name: string; manufacturer: string | null }
): number {
  const makeA = a.manufacturer?.trim() ?? ''
  const makeB = b.manufacturer?.trim() ?? ''
  const collate = { numeric: true, sensitivity: 'base' } as const

  if ((makeA === '') !== (makeB === '')) return makeA === '' ? 1 : -1

  const byMake = makeA.localeCompare(makeB, undefined, collate)
  if (byMake !== 0) return byMake

  // Compare the model, not the stored name: this catalogue is inconsistent about whether a name
  // repeats its own manufacturer, so raw names file the same locker under two letters — "610"
  // under 6 and "Universal Audio 1176" under U, with both makers reading "Universal Audio".
  return stripManufacturerPrefix(a.name, makeA).localeCompare(
    stripManufacturerPrefix(b.name, makeB),
    undefined,
    collate
  )
}

/** The pending row already holding this model, if any. Compares on manufacturer + name through
 *  gearIdentityKey, the same normalisation the rest of the app uses to decide two rows are the
 *  same box, so casing and stray spacing don't hide a match. */
function findPendingRow<T extends { key: string; name: string; manufacturer: string | null }>(
  rows: T[],
  name: string,
  manufacturer: string | null
): T | undefined {
  const wanted = gearIdentityKey(name, manufacturer)
  return rows.find((row) => gearIdentityKey(row.name, row.manufacturer) === wanted)
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
  onAdd: (name: string, manufacturer: string | null, count: number) => void
  namePlaceholder: string
  manufacturerSuggestions: string[]
  catalogueItems: { name: string; manufacturer: string | null }[]
  /** "Quantity" for mics/outboard, "Channels" for preamps. Defaults to "Quantity". */
  countLabel?: string
}

function ManualEntryForm({
  onAdd,
  namePlaceholder,
  manufacturerSuggestions,
  catalogueItems,
  countLabel = 'Quantity'
}: ManualEntryFormProps): JSX.Element {
  const [name, setName] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [quantity, setQuantity] = useState('1')
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
      <SuggestInput
        placeholder="Manufacturer"
        value={manufacturer}
        onChange={(v) => setManufacturer(v)}
        suggestions={manufacturerSuggestions}
      />
      <SuggestInput
        placeholder={namePlaceholder}
        value={name}
        onChange={(v) => setName(v)}
        onBlur={handleNameBlur}
        suggestions={modelSuggestions}
      />
      <input
        type="number"
        min={1}
        style={{ width: 70 }}
        title={countLabel}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
      />
      <button className="btn" onClick={handleAdd} disabled={!name.trim()}>
        + Add manually
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
  const [pendingPreamps, setPendingPreamps] = useState<PendingPreampItem[]>([])
  const [removedMicIds, setRemovedMicIds] = useState<Set<number>>(new Set())
  const [removedOutboardIds, setRemovedOutboardIds] = useState<Set<number>>(new Set())
  const [removedPreampIds, setRemovedPreampIds] = useState<Set<number>>(new Set())
  // allMics/allOutboard (studio-tagged) feed the "Import Gear from Another Studio" modal;
  // micCatalogueSource/outboardCatalogueSource/preampCatalogueSource are the comprehensive
  // every-pool lists feeding the "Add from Catalogue" dropdowns — origin deliberately doesn't
  // matter there.
  const [allMics, setAllMics] = useState<MicWithStudio[]>([])
  const [allOutboard, setAllOutboard] = useState<OutboardGearWithStudio[]>([])
  const [allPreamps, setAllPreamps] = useState<PreampWithStudio[]>([])
  const [micCatalogueSource, setMicCatalogueSource] = useState<Mic[]>([])
  const [outboardCatalogueSource, setOutboardCatalogueSource] = useState<OutboardGear[]>([])
  const [preampCatalogueSource, setPreampCatalogueSource] = useState<Preamp[]>([])
  const [gearTab, setGearTab] = useState<GearTab>('mics')
  // Row the catalogue picker just pointed at, cleared once the flash has run its course.
  const [flashKey, setFlashKey] = useState<string | null>(null)
  const gearRowRefs = useRef(new Map<string, HTMLTableRowElement>())
  const [saving, setSaving] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  // Set the first time a brand-new studio gets a row created early — purely so the Room layout
  // button has a studioId to attach the upload to before the user has clicked "Save Studio".
  // Never set when editing an existing studio (studioSetupId already covers that case).
  const [createdStudioId, setCreatedStudioId] = useState<number | null>(null)
  const [creatingForLayout, setCreatingForLayout] = useState(false)
  const activeStudioId = studioSetupId ?? createdStudioId

  const { folders, selectedFolderId, setSelectedFolderId, createFolder } = useFolderPicker('studio')

  const gearCounts: Record<GearTab, number> = {
    mics: pendingMics.length,
    outboard: pendingOutboard.length,
    preamps: pendingPreamps.length
  }

  const catalogueMics = dedupeByNameAndManufacturer(micCatalogueSource)
  const catalogueOutboard = dedupeByNameAndManufacturer(outboardCatalogueSource)
  const cataloguePreamps = dedupeByNameAndManufacturer(preampCatalogueSource)

  const catalogueManufacturers = useMemo(() => {
    const set = new Set<string>()
    for (const m of micCatalogueSource) if (m.manufacturer) set.add(m.manufacturer.trim())
    for (const o of outboardCatalogueSource) if (o.manufacturer) set.add(o.manufacturer.trim())
    for (const p of preampCatalogueSource) if (p.manufacturer) set.add(p.manufacturer.trim())
    for (const p of MANUFACTURER_PREFIXES) set.add(p)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [micCatalogueSource, outboardCatalogueSource, preampCatalogueSource])

  useEffect(() => {
    window.api.mics.listAllWithStudio().then(setAllMics)
    window.api.outboard.listAllWithStudio().then(setAllOutboard)
    window.api.preamps.listAllWithStudio().then(setAllPreamps)
    window.api.mics.listAll().then(setMicCatalogueSource)
    window.api.outboard.listAll().then(setOutboardCatalogueSource)
    window.api.preamps.listAll().then(setPreampCatalogueSource)
    setCreatedStudioId(null)

    if (studioSetupId != null) {
      window.api.studios.get(studioSetupId).then((studio) => {
        if (!studio) return
        setName(studio.name)
        setSelectedFolderId(studio.folderId)
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
      window.api.preamps.listByStudio(studioSetupId).then((preamps) =>
        setPendingPreamps(
          preamps.map((p) => ({
            key: `existing-preamp-${p.id}`,
            existingId: p.id,
            name: p.name,
            manufacturer: p.manufacturer,
            category: p.category,
            channels: p.channels
          }))
        )
      )
    } else {
      setName('Untitled Studio')
      setPendingMics([])
      setPendingOutboard([])
      setPendingPreamps([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioSetupId])

  /** Adding a model from the catalogue says "this studio has one of these" — the catalogue is a
   *  list of gear TYPES, and whichever row happened to be first in it (some other studio's four
   *  SM-57s) is not a statement about this room. Hence quantity 1 unless a caller knows better;
   *  importing from a specific studio passes that studio's real count. */
  function addMic(id: number | null, quantity = 1): void {
    const source = micCatalogueSource.find((m) => m.id === id)
    if (!source) return
    setPendingMics((prev) => [
      ...prev,
      {
        key: tempKey(),
        name: source.name,
        manufacturer: source.manufacturer,
        category: source.category,
        quantity
      }
    ])
  }

  function addOutboard(id: number | null, quantity = 1): void {
    const source = outboardCatalogueSource.find((o) => o.id === id)
    if (!source) return
    setPendingOutboard((prev) => [
      ...prev,
      {
        key: tempKey(),
        name: source.name,
        manufacturer: source.manufacturer,
        category: source.category,
        quantity
      }
    ])
  }

  function addPreamp(id: number | null, channels?: number): void {
    const source = preampCatalogueSource.find((p) => p.id === id)
    if (!source) return
    setPendingPreamps((prev) => [
      ...prev,
      {
        key: tempKey(),
        name: source.name,
        manufacturer: source.manufacturer,
        category: source.category,
        channels: channels ?? source.channels
      }
    ])
  }

  /** Importing from a specific studio copies THAT studio's count, so the number matches the "(xN)"
   *  the modal showed. Resolve against allMics/allOutboard (the studio-tagged lists the modal was
   *  built from) — the id belongs to that studio's row, not to the deduped global catalogue. */
  function handleImportGear(micIds: number[], outboardIds: number[], preampIds: number[]): void {
    const chosen = <T extends { id: number; name: string; manufacturer: string | null }>(
      source: T[],
      ids: number[]
    ): T[] => {
      const wanted = new Set(ids)
      return source.filter((item) => wanted.has(item.id)).sort(byManufacturerThenModel)
    }

    for (const mic of chosen(allMics, micIds)) addMic(mic.id, mic.quantity)
    for (const gear of chosen(allOutboard, outboardIds)) addOutboard(gear.id, gear.quantity)
    for (const preamp of chosen(allPreamps, preampIds)) addPreamp(preamp.id, preamp.channels)
  }

  /** Scrolls a pending row into view and flashes it. Clearing first and setting on the next frame
   *  restarts the animation, so picking the same model twice flashes twice rather than sitting
   *  there looking broken. */
  function revealRow(key: string): void {
    setFlashKey(null)
    requestAnimationFrame(() => setFlashKey(key))
  }

  useEffect(() => {
    if (!flashKey) return
    gearRowRefs.current.get(flashKey)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const timer = setTimeout(() => setFlashKey(null), 1400)
    return () => clearTimeout(timer)
  }, [flashKey])

  /* Picking a model the studio already lists is almost always someone hunting for the row rather
   * than claiming a second physical box, and a silent second row for the same mic is how a locker
   * ends up with "SM-57" twice at one each. Point at the row they already have and let them raise
   * its count. These wrap the plain add functions rather than replacing them, so importing a whole
   * locker is unaffected. */
  function pickMicFromCatalogue(id: number | null): void {
    const source = micCatalogueSource.find((m) => m.id === id)
    if (!source) return
    const existing = findPendingRow(pendingMics, source.name, source.manufacturer)
    if (existing) revealRow(existing.key)
    else addMic(id)
  }

  function pickOutboardFromCatalogue(id: number | null): void {
    const source = outboardCatalogueSource.find((o) => o.id === id)
    if (!source) return
    const existing = findPendingRow(pendingOutboard, source.name, source.manufacturer)
    if (existing) revealRow(existing.key)
    else addOutboard(id)
  }

  function pickPreampFromCatalogue(id: number | null): void {
    const source = preampCatalogueSource.find((p) => p.id === id)
    if (!source) return
    const existing = findPendingRow(pendingPreamps, source.name, source.manufacturer)
    if (existing) revealRow(existing.key)
    else addPreamp(id)
  }

  function addManualMic(itemName: string, manufacturer: string | null, quantity: number): void {
    setPendingMics((prev) => [...prev, { key: tempKey(), name: itemName, manufacturer, category: null, quantity }])
  }

  function addManualOutboard(itemName: string, manufacturer: string | null, quantity: number): void {
    setPendingOutboard((prev) => [...prev, { key: tempKey(), name: itemName, manufacturer, category: null, quantity }])
  }

  function addManualPreamp(itemName: string, manufacturer: string | null, channels: number): void {
    setPendingPreamps((prev) => [...prev, { key: tempKey(), name: itemName, manufacturer, category: null, channels }])
  }

  function removeMic(item: PendingItem): void {
    setPendingMics((prev) => prev.filter((m) => m.key !== item.key))
    if (item.existingId != null) setRemovedMicIds((prev) => new Set(prev).add(item.existingId!))
  }

  function removeOutboard(item: PendingItem): void {
    setPendingOutboard((prev) => prev.filter((o) => o.key !== item.key))
    if (item.existingId != null) setRemovedOutboardIds((prev) => new Set(prev).add(item.existingId!))
  }

  function removePreamp(item: PendingPreampItem): void {
    setPendingPreamps((prev) => prev.filter((p) => p.key !== item.key))
    if (item.existingId != null) setRemovedPreampIds((prev) => new Set(prev).add(item.existingId!))
  }

  function updateMic(key: string, patch: Partial<PendingItem>): void {
    setPendingMics((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)))
  }

  function updateOutboard(key: string, patch: Partial<PendingItem>): void {
    setPendingOutboard((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)))
  }

  function updatePreamp(key: string, patch: Partial<PendingPreampItem>): void {
    setPendingPreamps((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  }

  // Creates the studio row early if it doesn't exist yet, so the Room layout button has a real
  // studioId to attach an upload to before the user has clicked "Save Studio". Returns null if
  // there's no name yet to create with. Editing an existing studio always short-circuits to its
  // real id; nothing is created twice.
  async function ensureStudioExists(): Promise<number | null> {
    if (activeStudioId) return activeStudioId
    if (!name.trim()) return null
    const created = await window.api.studios.createCustom(name.trim(), selectedFolderId)
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

  // If a studio row was created early purely to back the Room layout button and the user backs
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
      const studioId = activeStudioId
        ? (await window.api.studios.updateCustomDetails(activeStudioId, name.trim(), selectedFolderId)).id
        : (await window.api.studios.createCustom(name.trim(), selectedFolderId)).id

      for (const id of removedMicIds) await window.api.mics.remove(id)
      for (const id of removedOutboardIds) await window.api.outboard.remove(id)
      for (const id of removedPreampIds) await window.api.preamps.remove(id)

      for (const [index, item] of pendingMics.entries()) {
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
          quantity: item.quantity,
          sortOrder: index
        })
      }
      for (const [index, item] of pendingOutboard.entries()) {
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
          quantity: item.quantity,
          sortOrder: index
        })
      }
      for (const [index, item] of pendingPreamps.entries()) {
        await window.api.preamps.upsert({
          id: item.existingId,
          poolType: 'studio',
          studioId,
          buildingId: null,
          setupId: null,
          name: item.name,
          manufacturer: item.manufacturer,
          category: item.category,
          notes: null,
          channels: item.channels,
          sortOrder: index
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
        <div className="spacer" />
        <button className="btn" onClick={handleCancel}>
          Cancel
        </button>
        <button className="btn primary" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save studio'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 16, padding: 16, minHeight: 0 }}>
        {/* The room's own settings live in a rail so they stop competing with the gear lists for
            vertical space. Cataloguing gear is why this page exists; the folder and the layout
            file are each set once. */}
        <div style={{ width: 260, flexShrink: 0, overflow: 'auto', padding: 3, margin: -3 }}>
          <div className="section-title" style={{ marginTop: 0 }}>
            Folder
          </div>
          <FolderPicker
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelect={setSelectedFolderId}
            onCreateFolder={createFolder}
          />

          <div className="section-title">Room layout</div>
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

          <div className="section-title">Fill from elsewhere</div>
          <button className="btn" onClick={() => setImportModalOpen(true)}>
            Import gear from another studio…
          </button>
          <p className="card-sub" style={{ marginTop: 8 }}>
            Copies the mic locker, outboard rack and preamps from a room you already have.
          </p>
        </div>

        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 3, margin: -3 }}>
          {/* Same button/primary idiom the Settings tab strip uses. The counts ride on the tabs so
              a locker you aren't looking at still says how full it is — stacked flat, preamps sat
              below a long outboard table and read as missing entirely. */}
          {/* Pinned: a 42-row mic locker scrolls the strip away otherwise, and switching to preamps
              then meant scrolling back to the top to find the tabs. Opaque so rows pass under it. */}
          <div
            className="inline-form"
            style={{
              position: 'sticky',
              top: -3,
              zIndex: 2,
              marginTop: 0,
              paddingBottom: 12,
              background: 'var(--color-bg)'
            }}
          >
            {GEAR_TABS.map((tab) => (
              <button
                key={tab.id}
                className={gearTab === tab.id ? 'btn primary' : 'btn'}
                onClick={() => setGearTab(tab.id)}
              >
                {tab.label} {gearCounts[tab.id]}
              </button>
            ))}
          </div>

          {gearTab === 'mics' && (
            <>
              <ManufacturerPickerDropdown
                items={catalogueMics}
                usedByOthers={() => 0}
                getQuantity={(m) => m.quantity}
                selectedId={null}
                onSelect={pickMicFromCatalogue}
                placeholder="+ Add Mic from Catalogue"
                showUsage={false}
              />
              <ManualEntryForm
                onAdd={addManualMic}
                namePlaceholder="Mic name (e.g. Neumann U87)"
                manufacturerSuggestions={catalogueManufacturers}
                catalogueItems={catalogueMics}
              />
              {pendingMics.length > 0 && (
                <table className="data-table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Manufacturer</th>
                      <th>Name</th>
                      <th>Qty</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingMics.map((item) => (
                      <tr
                        key={item.key}
                        ref={(el) => {
                          if (el) gearRowRefs.current.set(item.key, el)
                          else gearRowRefs.current.delete(item.key)
                        }}
                        className={flashKey === item.key ? 'gear-row-flash' : undefined}
                      >
                        <td>
                          <input
                            value={item.manufacturer ?? ''}
                            onChange={(e) => updateMic(item.key, { manufacturer: e.target.value || null })}
                          />
                        </td>
                        <td>
                          <input value={item.name} onChange={(e) => updateMic(item.key, { name: e.target.value })} />
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
                            <X size={14} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

            </>
          )}

          {gearTab === 'outboard' && (
            <>
              <ManufacturerPickerDropdown
                items={catalogueOutboard}
                usedByOthers={() => 0}
                getQuantity={(o) => o.quantity}
                selectedId={null}
                onSelect={pickOutboardFromCatalogue}
                placeholder="+ Add Outboard from Catalogue"
                showUsage={false}
              />
              <ManualEntryForm
                onAdd={addManualOutboard}
                namePlaceholder="Gear name (e.g. 1176 Compressor)"
                manufacturerSuggestions={catalogueManufacturers}
                catalogueItems={catalogueOutboard}
              />
              {pendingOutboard.length > 0 && (
                <table className="data-table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Manufacturer</th>
                      <th>Name</th>
                      <th>Qty</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingOutboard.map((item) => (
                      <tr
                        key={item.key}
                        ref={(el) => {
                          if (el) gearRowRefs.current.set(item.key, el)
                          else gearRowRefs.current.delete(item.key)
                        }}
                        className={flashKey === item.key ? 'gear-row-flash' : undefined}
                      >
                        <td>
                          <input
                            value={item.manufacturer ?? ''}
                            onChange={(e) => updateOutboard(item.key, { manufacturer: e.target.value || null })}
                          />
                        </td>
                        <td>
                          <input value={item.name} onChange={(e) => updateOutboard(item.key, { name: e.target.value })} />
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
                            <X size={14} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

            </>
          )}

          {gearTab === 'preamps' && (
            <>
              <ManufacturerPickerDropdown
                items={cataloguePreamps}
                usedByOthers={() => 0}
                getQuantity={(p) => p.channels}
                selectedId={null}
                onSelect={pickPreampFromCatalogue}
                placeholder="+ Add Preamp from Catalogue"
                showUsage={false}
              />
              <ManualEntryForm
                onAdd={addManualPreamp}
                namePlaceholder="Preamp name (e.g. 8-channel)"
                manufacturerSuggestions={catalogueManufacturers}
                catalogueItems={cataloguePreamps}
                countLabel="Channels"
              />
              {pendingPreamps.length > 0 && (
                <table className="data-table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Manufacturer</th>
                      <th>Name</th>
                      <th>Channels</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPreamps.map((item) => (
                      <tr
                        key={item.key}
                        ref={(el) => {
                          if (el) gearRowRefs.current.set(item.key, el)
                          else gearRowRefs.current.delete(item.key)
                        }}
                        className={flashKey === item.key ? 'gear-row-flash' : undefined}
                      >
                        <td>
                          <input
                            value={item.manufacturer ?? ''}
                            onChange={(e) => updatePreamp(item.key, { manufacturer: e.target.value || null })}
                          />
                        </td>
                        <td>
                          <input value={item.name} onChange={(e) => updatePreamp(item.key, { name: e.target.value })} />
                        </td>
                        <td style={{ maxWidth: 70 }}>
                          <input
                            type="number"
                            min={1}
                            value={item.channels}
                            onChange={(e) => updatePreamp(item.key, { channels: Math.max(1, Number(e.target.value)) })}
                          />
                        </td>
                        <td>
                          <button className="btn small danger" onClick={() => removePreamp(item)}>
                            <X size={14} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
      {importModalOpen && (
        <ImportGearModal
          allMics={allMics}
          allOutboard={allOutboard}
          allPreamps={allPreamps}
          currentStudioId={studioSetupId}
          onImport={handleImportGear}
          onClose={() => setImportModalOpen(false)}
        />
      )}
    </div>
  )
}
