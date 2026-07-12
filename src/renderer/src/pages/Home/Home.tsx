import { useEffect, useState } from 'react'
import type { Building, Studio } from '@shared/types/entities'
import type { Folder, FolderScope, Setup } from '@shared/types/setup'
import type { FolderDeleteImpact } from '@shared/types/ipc'
import { useNavigationStore } from '@renderer/state/navigationStore'
import { useBerkleeFeaturesStore } from '@renderer/state/berkleeFeaturesStore'
import { useHomeLayoutStore } from '@renderer/state/homeLayoutStore'
import HomeSection, { type HomeEntry } from '@renderer/components/home/HomeSection'
import NewSetupModal, { type NewSetupDetails } from '@renderer/components/NewSetupModal'
import ManageItemsModal, { type ManagedItem } from '@renderer/components/ManageItemsModal'

type CustomStudioItem = { kind: 'studio'; data: Studio } | { kind: 'template'; data: Setup }

interface PendingStudioSelection {
  buildingId: number | null
  studioId: number
}

type TemplateBrowse =
  | { kind: 'normal' }
  | { kind: 'berklee-root' }
  | { kind: 'berklee-building'; buildingId: number }

export default function Home(): JSX.Element {
  const goToSetup = useNavigationStore((s) => s.goToSetup)
  const goToStudioSetup = useNavigationStore((s) => s.goToStudioSetup)
  const berkleeFeaturesEnabled = useBerkleeFeaturesStore((s) => s.enabled)
  const homeLayout = useHomeLayoutStore((s) => s.layout)

  const [customStudios, setCustomStudios] = useState<Studio[]>([])
  const [customTemplates, setCustomTemplates] = useState<Setup[]>([])
  // Studio folders (custom studios + templates) and setup folders (saved setups) are independent
  // namespaces — see migration 020. Kept as two lists so a folder in one never shows in the other.
  const [studioFolders, setStudioFolders] = useState<Folder[]>([])
  const [setupFolders, setSetupFolders] = useState<Folder[]>([])
  const [selectedCustomFolderId, setSelectedCustomFolderId] = useState<number | null>(null)
  const [selectedSetupFolderId, setSelectedSetupFolderId] = useState<number | null>(null)
  const [savedSetups, setSavedSetups] = useState<Setup[]>([])
  const [buildingIdByStudio, setBuildingIdByStudio] = useState<Map<number, number | null>>(new Map())
  const [pendingSelection, setPendingSelection] = useState<PendingStudioSelection | null>(null)
  const [templateBrowse, setTemplateBrowse] = useState<TemplateBrowse>({ kind: 'normal' })
  const [berkleeBuildings, setBerkleeBuildings] = useState<Building[]>([])
  const [berkleeStudios, setBerkleeStudios] = useState<Studio[]>([])
  const [manageMode, setManageMode] = useState<'studios' | 'setups' | null>(null)

  function reload(): void {
    window.api.studios.listCustom().then(setCustomStudios)
    window.api.setups.listByKind({ kind: 'template', templateSource: 'custom' }).then(setCustomTemplates)
    window.api.folders.list('studio').then(setStudioFolders)
    window.api.folders.list('setup').then(setSetupFolders)
    window.api.setups.listByKind({ kind: 'setup' }).then(setSavedSetups)
  }

  useEffect(reload, [])

  useEffect(() => {
    const missingStudioIds = [...new Set(savedSetups.map((s) => s.studioId))].filter(
      (id) => !buildingIdByStudio.has(id)
    )
    if (missingStudioIds.length === 0) return

    Promise.all(missingStudioIds.map((id) => window.api.studios.get(id))).then((fetchedStudios) => {
      setBuildingIdByStudio((prev) => {
        const next = new Map(prev)
        for (const studio of fetchedStudios) {
          if (studio) next.set(studio.id, studio.buildingId)
        }
        return next
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSetups])

  useEffect(() => {
    if (templateBrowse.kind === 'berklee-root' && berkleeBuildings.length === 0) {
      window.api.buildings.list().then(setBerkleeBuildings)
    }
    if (templateBrowse.kind === 'berklee-building') {
      window.api.studios.listByBuilding(templateBrowse.buildingId).then(setBerkleeStudios)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateBrowse])

  async function startQuickSetup(): Promise<void> {
    const studio = await window.api.studios.createTemporary()
    setPendingSelection({ buildingId: null, studioId: studio.id })
  }

  async function handleCreateSetup(details: NewSetupDetails): Promise<void> {
    if (!pendingSelection) return
    const setup = await window.api.setups.create(
      pendingSelection.studioId,
      details.name,
      details.sessionDate,
      details.folderId,
      details.engineer,
      details.artist,
      false
    )
    goToSetup(pendingSelection.buildingId, pendingSelection.studioId, setup.id)
    setPendingSelection(null)
  }

  async function openSavedSetup(setup: Setup): Promise<void> {
    let buildingId = buildingIdByStudio.get(setup.studioId)
    if (buildingId === undefined) {
      const studio = await window.api.studios.get(setup.studioId)
      if (!studio) return
      buildingId = studio.buildingId
    }
    goToSetup(buildingId, setup.studioId, setup.id)
  }

  async function openCustomTemplate(template: Setup): Promise<void> {
    const newSetup = await window.api.setups.instantiateFromTemplate(template.id)
    const studio = await window.api.studios.get(newSetup.studioId)
    if (!studio) return
    goToSetup(studio.buildingId, newSetup.studioId, newSetup.id)
  }

  const customStudioItems: CustomStudioItem[] = [
    ...customStudios.map((data): CustomStudioItem => ({ kind: 'studio', data })),
    ...customTemplates.map((data): CustomStudioItem => ({ kind: 'template', data }))
  ]

  // Normalized entries for the studio-template section (custom studios + templates), rendered by
  // whichever home layout is active. Studios carry an "Edit inventory" secondary action.
  const templateEntries: HomeEntry[] = customStudioItems.map((item) =>
    item.kind === 'studio'
      ? {
          id: `studio-${item.data.id}`,
          kind: 'studio',
          folderId: item.data.folderId,
          label: item.data.name,
          meta: 'Studio',
          icon: '🎛',
          onActivate: () => setPendingSelection({ buildingId: item.data.buildingId, studioId: item.data.id }),
          secondaryAction: { label: 'Edit inventory', onClick: () => goToStudioSetup(item.data.id) }
        }
      : {
          id: `template-${item.data.id}`,
          kind: 'template',
          folderId: item.data.folderId,
          label: item.data.name,
          meta: 'Gear list',
          icon: '📄',
          onActivate: () => openCustomTemplate(item.data)
        }
  )

  const setupEntries: HomeEntry[] = savedSetups.map((setup) => ({
    id: `setup-${setup.id}`,
    kind: 'setup',
    folderId: setup.folderId,
    label: setup.name,
    meta: setup.sessionDate ?? 'no date',
    onActivate: () => openSavedSetup(setup)
  }))

  function renderBerkleeStudioCard(studio: Studio): JSX.Element {
    return (
      <button
        key={`berklee-studio-${studio.id}`}
        className="card clickable"
        onClick={() => setPendingSelection({ buildingId: studio.buildingId, studioId: studio.id })}
      >
        <div className="card-title">🎛 {studio.name}</div>
        <div className="card-sub">Berklee Studio</div>
      </button>
    )
  }

  // Folder CRUD dispatch. Create is scope-bound (each manage modal passes its own scope); rename
  // and delete are id-based and scope-agnostic. reload() refreshes both scoped lists.
  async function handleCreateFolder(
    name: string,
    parentFolderId: number | null,
    scope: FolderScope
  ): Promise<void> {
    await window.api.folders.create(name, parentFolderId, scope)
    reload()
  }
  async function handleRenameFolder(id: number, name: string): Promise<void> {
    await window.api.folders.rename(id, name)
    reload()
  }
  function handleGetFolderDeleteImpact(id: number): Promise<FolderDeleteImpact> {
    return window.api.folders.getDeleteImpact(id)
  }
  async function handleDeleteFolderRecursive(id: number): Promise<void> {
    await window.api.folders.deleteRecursive(id)
    reload()
  }
  async function handleDeleteFolderPromoteContents(id: number): Promise<void> {
    await window.api.folders.deletePromoteContents(id)
    reload()
  }

  const manageStudioItems: ManagedItem[] = customStudioItems.map((item) => ({
    kind: item.kind,
    id: item.data.id,
    folderId: item.data.folderId,
    label: item.kind === 'studio' ? `🎛 ${item.data.name}` : `📄 ${item.data.name}`
  }))

  async function handleStudioItemMoveToFolder(kind: string, id: number, folderId: number | null): Promise<void> {
    if (kind === 'studio') await window.api.studios.moveToFolder(id, folderId)
    else await window.api.setups.moveToFolder(id, folderId)
    reload()
  }
  async function handleStudioItemReorder(kind: string, _folderId: number | null, orderedIds: number[]): Promise<void> {
    if (kind === 'studio') await window.api.studios.reorder(orderedIds)
    else await window.api.setups.reorder(orderedIds)
    reload()
  }
  async function handleStudioItemDelete(kind: string, item: ManagedItem): Promise<void> {
    if (kind === 'studio') await window.api.studios.remove(item.id)
    else await window.api.setups.remove(item.id)
    reload()
  }

  const manageSetupItems: ManagedItem[] = savedSetups.map((s) => ({
    kind: 'setup',
    id: s.id,
    folderId: s.folderId,
    label: s.name
  }))

  async function handleSetupItemMoveToFolder(_kind: string, id: number, folderId: number | null): Promise<void> {
    await window.api.setups.moveToFolder(id, folderId)
    reload()
  }
  async function handleSetupItemReorder(_kind: string, _folderId: number | null, orderedIds: number[]): Promise<void> {
    await window.api.setups.reorder(orderedIds)
    reload()
  }
  async function handleSetupItemDelete(_kind: string, item: ManagedItem): Promise<void> {
    await window.api.setups.remove(item.id)
    reload()
  }

  const templateSectionTitle = 'New Setup From Studio Template'

  return (
    <div className="page">
      <h2 style={{ margin: 0 }}>Setup Sheet Helper</h2>

      <div className="section-title" style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span>Quick setup</span>
      </div>
      <div className="list-grid">
        <button className="card clickable" style={{ borderStyle: 'dashed' }} onClick={startQuickSetup}>
          <div className="card-title">+ Quick setup</div>
          <div className="card-sub">No studio setup — free-text mic/outboard entry</div>
        </button>
      </div>

      {templateBrowse.kind === 'berklee-root' && berkleeFeaturesEnabled && (
        <div>
          <div className="section-title" style={{ marginTop: 24 }}>
            {templateSectionTitle}
          </div>
          <div className="nav-crumbs">
            <button onClick={() => setTemplateBrowse({ kind: 'normal' })}>{templateSectionTitle}</button> / Berklee
          </div>
          <div className="list-grid">
            {berkleeBuildings.map((b) => (
              <button
                key={b.id}
                className="card clickable"
                onClick={() => setTemplateBrowse({ kind: 'berklee-building', buildingId: b.id })}
              >
                <div className="card-title">📁 {b.name}</div>
              </button>
            ))}
            {berkleeBuildings.length === 0 && <div className="empty-state">No Berklee buildings set up yet.</div>}
          </div>
        </div>
      )}

      {templateBrowse.kind === 'berklee-building' && berkleeFeaturesEnabled && (
        <div>
          <div className="section-title" style={{ marginTop: 24 }}>
            {templateSectionTitle}
          </div>
          <div className="nav-crumbs">
            <button onClick={() => setTemplateBrowse({ kind: 'normal' })}>{templateSectionTitle}</button> /{' '}
            <button onClick={() => setTemplateBrowse({ kind: 'berklee-root' })}>Berklee</button> /{' '}
            {berkleeBuildings.find((b) => b.id === templateBrowse.buildingId)?.name}
          </div>
          <div className="list-grid">
            {berkleeStudios.map(renderBerkleeStudioCard)}
            {berkleeStudios.length === 0 && <div className="empty-state">No studios in this building yet.</div>}
          </div>
        </div>
      )}

      {templateBrowse.kind === 'normal' && (
        <HomeSection
          title={templateSectionTitle}
          layout={homeLayout}
          folders={studioFolders}
          entries={templateEntries}
          selectedFolderId={selectedCustomFolderId}
          onSelectFolder={setSelectedCustomFolderId}
          leadingTiles={
            berkleeFeaturesEnabled && (
              <button className="card clickable" onClick={() => setTemplateBrowse({ kind: 'berklee-root' })}>
                <div className="card-title">📁 Berklee</div>
                <div className="card-sub">Real Berklee studios</div>
              </button>
            )
          }
          headerAction={
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn small" onClick={() => goToStudioSetup(null)}>
                + New studio
              </button>
              <button className="btn small" onClick={() => setManageMode('studios')}>
                Manage studios
              </button>
            </div>
          }
        />
      )}

      <HomeSection
        title="Saved Setups"
        layout={homeLayout}
        folders={setupFolders}
        entries={setupEntries}
        selectedFolderId={selectedSetupFolderId}
        onSelectFolder={setSelectedSetupFolderId}
        emptyMessage="No saved setups in this folder yet."
        headerAction={
          <button className="btn small" onClick={() => setManageMode('setups')}>
            Manage setups
          </button>
        }
      />

      {pendingSelection && (
        <NewSetupModal onClose={() => setPendingSelection(null)} onCreate={handleCreateSetup} />
      )}

      {manageMode === 'studios' && (
        <ManageItemsModal
          title="Manage studios"
          items={manageStudioItems}
          folders={studioFolders}
          onMoveToFolder={handleStudioItemMoveToFolder}
          onReorder={handleStudioItemReorder}
          onDelete={handleStudioItemDelete}
          onCreateFolder={(name, parentFolderId) => handleCreateFolder(name, parentFolderId, 'studio')}
          onRenameFolder={handleRenameFolder}
          onGetFolderDeleteImpact={handleGetFolderDeleteImpact}
          onDeleteFolderRecursive={handleDeleteFolderRecursive}
          onDeleteFolderPromoteContents={handleDeleteFolderPromoteContents}
          onClose={() => setManageMode(null)}
        />
      )}

      {manageMode === 'setups' && (
        <ManageItemsModal
          title="Manage setups"
          items={manageSetupItems}
          folders={setupFolders}
          onMoveToFolder={handleSetupItemMoveToFolder}
          onReorder={handleSetupItemReorder}
          onDelete={handleSetupItemDelete}
          onCreateFolder={(name, parentFolderId) => handleCreateFolder(name, parentFolderId, 'setup')}
          onRenameFolder={handleRenameFolder}
          onGetFolderDeleteImpact={handleGetFolderDeleteImpact}
          onDeleteFolderRecursive={handleDeleteFolderRecursive}
          onDeleteFolderPromoteContents={handleDeleteFolderPromoteContents}
          onClose={() => setManageMode(null)}
        />
      )}
    </div>
  )
}
