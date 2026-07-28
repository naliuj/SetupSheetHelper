import { useEffect, useState } from 'react'
import { Speaker, FileText, Layers } from 'lucide-react'
import type { Building, Studio } from '@shared/types/entities'
import type { Folder, FolderScope, MultiSetup, Setup } from '@shared/types/setup'
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


export default function Home(): JSX.Element {
  const goToSetup = useNavigationStore((s) => s.goToSetup)
  const goToStudioSetup = useNavigationStore((s) => s.goToStudioSetup)
  const setEditorMode = useNavigationStore((s) => s.setEditorMode)
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
  const [multiSetups, setMultiSetups] = useState<MultiSetup[]>([])
  const [buildingIdByStudio, setBuildingIdByStudio] = useState<Map<number, number | null>>(new Map())
  const [pendingSelection, setPendingSelection] = useState<PendingStudioSelection | null>(null)
  const [duplicateOf, setDuplicateOf] = useState<Setup | null>(null)
  const [berkleeBuildings, setBerkleeBuildings] = useState<Building[]>([])
  const [berkleeStudios, setBerkleeStudios] = useState<Studio[]>([])
  const [manageMode, setManageMode] = useState<'studios' | 'setups' | null>(null)

  function reload(): void {
    window.api.studios.listCustom().then(setCustomStudios)
    window.api.setups.listByKind({ kind: 'template', templateSource: 'custom' }).then(setCustomTemplates)
    window.api.folders.list('studio').then(setStudioFolders)
    window.api.folders.list('setup').then(setSetupFolders)
    window.api.setups.listByKind({ kind: 'setup' }).then(setSavedSetups)
    window.api.multiSetups.listAll().then(setMultiSetups)
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

  // Berklee lives inline in the templates section as a folder subtree (buildings → studios), so its
  // whole hierarchy loads up front whenever Berklee features are on — every layout renders it like
  // any other folder.
  useEffect(() => {
    if (!berkleeFeaturesEnabled) {
      setBerkleeBuildings([])
      setBerkleeStudios([])
      return
    }
    let cancelled = false
    window.api.buildings.list().then(async (buildings) => {
      if (cancelled) return
      setBerkleeBuildings(buildings)
      const perBuilding = await Promise.all(buildings.map((b) => window.api.studios.listByBuilding(b.id)))
      if (!cancelled) setBerkleeStudios(perBuilding.flat())
    })
    return () => {
      cancelled = true
    }
  }, [berkleeFeaturesEnabled])

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
      details.facultyReserveEnabled
    )
    setEditorMode('table')
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
    setEditorMode('table')
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
          icon: Speaker,
          onActivate: () => setPendingSelection({ buildingId: item.data.buildingId, studioId: item.data.id }),
          secondaryAction: { label: 'Edit inventory', onClick: () => goToStudioSetup(item.data.id) }
        }
      : {
          id: `template-${item.data.id}`,
          kind: 'template',
          folderId: item.data.folderId,
          label: item.data.name,
          meta: 'Gear list',
          icon: FileText,
          onActivate: () => openCustomTemplate(item.data)
        }
  )

  // A Multi Setup is one thing on Home, not N — its members are the same session in the same room,
  // so listing them individually buries every standalone setup under a wall of band names. Derived
  // from the savedSetups fetch already in hand; member order matches the editor's tab strip
  // (listMultiSetupMembers orders by sort_order, id).
  const membersByMultiSetup = new Map<number, Setup[]>()
  for (const setup of savedSetups) {
    if (setup.multiSetupId == null) continue
    const members = membersByMultiSetup.get(setup.multiSetupId) ?? []
    members.push(setup)
    membersByMultiSetup.set(setup.multiSetupId, members)
  }
  for (const members of membersByMultiSetup.values()) {
    members.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  }
  const standaloneSetups = savedSetups.filter((s) => s.multiSetupId == null)

  // A group owns no folder of its own — its members do (there's no multi_setups.folder_id, so
  // setups.folder_id stays the single source of truth). First member wins, and moving a group from
  // Manage Setups moves every member, so the derivation and reality stay in step.
  const groupedMultiSetups = multiSetups
    .map((group) => ({ group, members: membersByMultiSetup.get(group.id) ?? [] }))
    .filter(({ members }) => members.length > 0)

  /** Opens the band the user was last in, falling back to the first member. */
  function openMultiSetup(group: MultiSetup, members: Setup[]): Promise<void> {
    return openSavedSetup(members.find((m) => m.id === group.lastSetupId) ?? members[0])
  }

  const setupEntries: HomeEntry[] = [
    ...standaloneSetups.map(
      (setup): HomeEntry => ({
        id: `setup-${setup.id}`,
        kind: 'setup',
        folderId: setup.folderId,
        label: setup.name,
        meta: setup.sessionDate ?? 'no date',
        onActivate: () => openSavedSetup(setup)
      })
    ),
    ...groupedMultiSetups.map(
      ({ group, members }): HomeEntry => ({
        id: `multiSetup-${group.id}`,
        kind: 'multiSetup',
        folderId: members[0].folderId,
        label: group.name,
        meta: `${members.length} setup${members.length === 1 ? '' : 's'} · ${members[0].sessionDate ?? 'no date'}`,
        badge: 'Multi Setup',
        icon: Layers,
        onActivate: () => openMultiSetup(group, members)
      })
    )
  ]

  // Berklee lives inline in the templates section as a folder subtree: a "Berklee" root folder,
  // one subfolder per building, studios as entries under their building. Synthetic negative folder
  // ids keep these clear of the real `folders` table ids they sit alongside.
  const berkleeRootFolderId = -1
  const berkleeBuildingFolderId = (buildingId: number): number => -100000 - buildingId
  const berkleeFolders: Folder[] = berkleeFeaturesEnabled
    ? [
        { id: berkleeRootFolderId, name: 'Berklee', parentFolderId: null, createdAt: '', scope: 'studio' },
        ...berkleeBuildings.map((b) => ({
          id: berkleeBuildingFolderId(b.id),
          name: b.name,
          parentFolderId: berkleeRootFolderId,
          createdAt: '',
          scope: 'studio' as const
        }))
      ]
    : []

  const berkleeStudioEntries: HomeEntry[] = berkleeStudios
    .filter((s): s is Studio & { buildingId: number } => s.buildingId != null)
    .map((studio) => ({
      id: `berklee-studio-${studio.id}`,
      kind: 'studio',
      folderId: berkleeBuildingFolderId(studio.buildingId),
      label: studio.name,
      meta: 'Berklee Studio',
      icon: Speaker,
      onActivate: () => setPendingSelection({ buildingId: studio.buildingId, studioId: studio.id })
    }))

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
    label: item.data.name,
    icon: item.kind === 'studio' ? Speaker : FileText
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
  async function handleStudioItemBulkDelete(items: ManagedItem[]): Promise<void> {
    const studioIds = items.filter((item) => item.kind === 'studio').map((item) => item.id)
    const templateIds = items.filter((item) => item.kind === 'template').map((item) => item.id)
    if (studioIds.length > 0) await window.api.studios.removeMany(studioIds)
    if (templateIds.length > 0) await window.api.setups.removeMany(templateIds)
    reload()
  }

  // Mirrors the Home grouping so both surfaces agree on what a Multi Setup is: one row, not N.
  const manageSetupItems: ManagedItem[] = [
    ...standaloneSetups.map((s) => ({ kind: 'setup', id: s.id, folderId: s.folderId, label: s.name })),
    ...groupedMultiSetups.map(({ group, members }) => ({
      kind: 'multiSetup',
      id: group.id,
      folderId: members[0].folderId,
      label: group.name,
      icon: Layers,
      kindLabel: 'Multi Setups',
      // Duplicating a whole Multi Setup isn't supported, and leaving the button on would let the
      // parent's id-based lookup match an unrelated setup that happens to share the group's id.
      disableDuplicate: true
    }))
  ]

  async function handleSetupItemMoveToFolder(kind: string, id: number, folderId: number | null): Promise<void> {
    // Main-side and atomic for a group — N renderer round-trips could half-apply.
    if (kind === 'multiSetup') await window.api.multiSetups.moveToFolder(id, folderId)
    else await window.api.setups.moveToFolder(id, folderId)
    reload()
  }
  async function handleSetupItemReorder(kind: string, _folderId: number | null, orderedIds: number[]): Promise<void> {
    // Expand groups back to their member ids — sort_order lives on setups, and keeping each group's
    // members contiguous is what makes the derived group position stable.
    const expanded =
      kind === 'multiSetup'
        ? orderedIds.flatMap((groupId) => (membersByMultiSetup.get(groupId) ?? []).map((m) => m.id))
        : orderedIds
    await window.api.setups.reorder(expanded)
    reload()
  }
  async function handleSetupItemDelete(kind: string, item: ManagedItem): Promise<void> {
    if (kind === 'multiSetup') await window.api.multiSetups.removeManyCascade([item.id])
    else await window.api.setups.remove(item.id)
    reload()
  }
  async function handleSetupItemBulkDelete(items: ManagedItem[]): Promise<void> {
    const setupIds = items.filter((i) => i.kind === 'setup').map((i) => i.id)
    const groupIds = items.filter((i) => i.kind === 'multiSetup').map((i) => i.id)
    if (setupIds.length > 0) await window.api.setups.removeMany(setupIds)
    if (groupIds.length > 0) await window.api.multiSetups.removeManyCascade(groupIds)
    reload()
  }

  function handleDuplicateItemClick(item: ManagedItem): void {
    // Belt-and-braces alongside disableDuplicate on group rows: this lookup is by id alone, and a
    // Multi Setup id can coincidentally equal a real setup's id — which would open the Duplicate
    // dialog for an unrelated setup.
    if (item.kind !== 'setup') return
    const setup = savedSetups.find((s) => s.id === item.id)
    if (setup) setDuplicateOf(setup)
  }

  // The rename prompt is NewSetupModal itself, seeded from the source setup — confirming it
  // calls setups.duplicate (full copy: table items, layout blocks, and room layout override)
  // rather than setups.create. Manage Setups stays open underneath (same layering pattern as
  // ManagePresetsModal's edit dialog).
  async function handleDuplicateCreate(details: NewSetupDetails): Promise<void> {
    if (!duplicateOf) return
    await window.api.setups.duplicate({
      sourceSetupId: duplicateOf.id,
      name: details.name,
      sessionDate: details.sessionDate,
      folderId: details.folderId,
      engineer: details.engineer,
      artist: details.artist,
      facultyReserveEnabled: details.facultyReserveEnabled
    })
    reload()
  }

  const templateSectionTitle = 'New Setup From Studio Template'

  return (
    <div className="page">
      <h2 style={{ margin: 0 }}>Setup Sheet Helper</h2>

      <HomeSection
        title={templateSectionTitle}
        layout={homeLayout}
        folders={[...berkleeFolders, ...studioFolders]}
        entries={[...templateEntries, ...berkleeStudioEntries]}
        selectedFolderId={selectedCustomFolderId}
        onSelectFolder={setSelectedCustomFolderId}
        emptyMessage={
          <div className="template-nudge">
            <div>
              <div className="template-nudge-title">Set up your studio once, reuse it every session</div>
              <div className="template-nudge-subtitle">
                Add your rooms, mics, and outboard gear — then every new setup starts pre-filled instead of from
                scratch.
              </div>
            </div>
            <button className="btn primary" onClick={() => goToStudioSetup(null)}>
              + New studio
            </button>
          </div>
        }
        headerAction={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn small primary" onClick={() => goToStudioSetup(null)}>
              + New studio
            </button>
            <button className="btn small" onClick={() => setManageMode('studios')}>
              Manage studios
            </button>
          </div>
        }
      />

      <div className="quick-setup-row">
        <span>Don&apos;t need a studio right now?</span>
        <button className="link-button" onClick={startQuickSetup}>
          Start a quick setup →
        </button>
      </div>

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
          onBulkDelete={handleStudioItemBulkDelete}
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
          onBulkDelete={handleSetupItemBulkDelete}
          onCreateFolder={(name, parentFolderId) => handleCreateFolder(name, parentFolderId, 'setup')}
          onRenameFolder={handleRenameFolder}
          onGetFolderDeleteImpact={handleGetFolderDeleteImpact}
          onDeleteFolderRecursive={handleDeleteFolderRecursive}
          onDeleteFolderPromoteContents={handleDeleteFolderPromoteContents}
          onDuplicateItem={handleDuplicateItemClick}
          disableEscapeClose={duplicateOf !== null}
          onClose={() => setManageMode(null)}
        />
      )}

      {duplicateOf && (
        <NewSetupModal
          initialName={`Copy of ${duplicateOf.name}`}
          initialSessionDate={duplicateOf.sessionDate}
          initialEngineer={duplicateOf.engineer}
          initialArtist={duplicateOf.artist}
          initialFolderId={duplicateOf.folderId}
          initialFacultyReserveEnabled={duplicateOf.facultyReserveEnabled}
          heading="Duplicate setup"
          confirmLabel="Duplicate"
          onClose={() => setDuplicateOf(null)}
          onCreate={handleDuplicateCreate}
        />
      )}
    </div>
  )
}
