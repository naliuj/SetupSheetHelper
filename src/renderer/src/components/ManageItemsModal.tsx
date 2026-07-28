import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Folder, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Folder as FolderType } from '@shared/types/setup'
import type { FolderDeleteImpact } from '@shared/types/ipc'
import { buildFolderTree, flattenFolderTreeForPicker } from '@renderer/state/folderTree'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'
import FolderTreeNode from './FolderTreeNode'

export interface ManagedItem {
  kind: string
  id: number
  folderId: number | null
  label: string
  /** Optional Lucide icon shown before the label. */
  icon?: LucideIcon
}

interface Props {
  title: string
  items: ManagedItem[]
  folders: FolderType[]
  onMoveToFolder: (kind: string, id: number, folderId: number | null) => Promise<void>
  onReorder: (kind: string, folderId: number | null, orderedIds: number[]) => Promise<void>
  onDelete: (kind: string, item: ManagedItem) => Promise<void>
  onBulkDelete: (items: ManagedItem[]) => Promise<void>
  onCreateFolder: (name: string, parentFolderId: number | null) => Promise<void>
  onRenameFolder: (id: number, name: string) => Promise<void>
  onGetFolderDeleteImpact: (id: number) => Promise<FolderDeleteImpact>
  onDeleteFolderRecursive: (id: number) => Promise<void>
  onDeleteFolderPromoteContents: (id: number) => Promise<void>
  /** When provided, each item row shows an "Edit" button that calls this — the parent renders
   *  its own editor. Omitted for callers (studios/setups) that edit elsewhere. */
  onEditItem?: (item: ManagedItem) => void
  /** When provided, each item row shows a "Duplicate" button that calls this — the parent
   *  renders its own copy flow (e.g. Setups' rename-then-copy dialog). Omitted for callers that
   *  don't support duplication. */
  onDuplicateItem?: (item: ManagedItem) => void
  /** Lets a parent-owned dialog (e.g. an edit modal layered on top) suppress this modal's own
   *  Escape-to-close while it's open, so Escape only closes the topmost layer. */
  disableEscapeClose?: boolean
  onClose: () => void
}

type FolderDialog =
  | { kind: 'create'; parentId: number | null }
  | { kind: 'rename'; id: number; currentName: string }
  | { kind: 'delete'; id: number; name: string; impact: FolderDeleteImpact }

function parseDndId(dndId: string): { kind: string; id: number } {
  const idx = dndId.indexOf('-')
  return { kind: dndId.slice(0, idx), id: Number(dndId.slice(idx + 1)) }
}

function RootFolderRow({
  selected,
  onSelect
}: {
  selected: boolean
  onSelect: () => void
}): JSX.Element {
  const { isOver, setNodeRef } = useDroppable({ id: 'folder-root' })
  return (
    <div
      ref={setNodeRef}
      className={`folder-tree-row ${selected ? 'selected' : ''} ${isOver ? 'drop-target' : ''}`}
      style={{ paddingLeft: 10 }}
    >
      <span className="folder-tree-toggle" />
      <button className="folder-tree-label" onClick={onSelect}>
        (No folder)
      </button>
    </div>
  )
}

/** A single flat folder row for search results — droppable and with the same select/CRUD actions
 *  as a tree node, but no expand toggle or indentation (search flattens the hierarchy). */
function FlatFolderRow({
  id,
  name,
  selected,
  onSelect,
  onCreateSubfolder,
  onRename,
  onDelete
}: {
  id: number
  name: string
  selected: boolean
  onSelect: () => void
  onCreateSubfolder: () => void
  onRename: () => void
  onDelete: () => void
}): JSX.Element {
  const { isOver, setNodeRef } = useDroppable({ id: `folder-${id}` })
  return (
    <div
      ref={setNodeRef}
      className={`folder-tree-row ${selected ? 'selected' : ''} ${isOver ? 'drop-target' : ''}`}
      style={{ paddingLeft: 10 }}
    >
      <span className="folder-tree-toggle" />
      <button className="folder-tree-label tree-label" onClick={onSelect}>
        <Folder className="home-icon" size={15} aria-hidden="true" />
        <span className="folder-tree-name">{name}</span>
      </button>
      <button className="folder-tree-action" title="New Subfolder" onClick={onCreateSubfolder}>
        <Plus size={15} aria-hidden="true" />
      </button>
      <button className="folder-tree-action" title="Rename" onClick={onRename}>
        <Pencil size={14} aria-hidden="true" />
      </button>
      <button className="folder-tree-action" title="Delete" onClick={onDelete}>
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** "2 subfolders, 3 studios, and 5 setups" — lists the subfolder count plus each non-zero item
 *  category (studios/setups, or presets), so the confirmation reads naturally for any namespace. */
function describeFolderImpact(impact: FolderDeleteImpact): string {
  const parts: string[] = []
  if (impact.folderCount > 0) parts.push(pluralize(impact.folderCount, 'subfolder'))
  for (const { noun, count } of impact.items) if (count > 0) parts.push(pluralize(count, noun))
  if (parts.length === 0) return 'This folder is empty.'
  const joined =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
  return `This folder contains ${joined}.`
}

function SortableItemRow({
  item,
  selected,
  onToggleSelect,
  onDelete,
  onEdit,
  onDuplicate
}: {
  item: ManagedItem
  selected: boolean
  onToggleSelect: () => void
  onDelete: () => void
  onEdit?: () => void
  onDuplicate?: () => void
}): JSX.Element {
  const dndId = `${item.kind}-${item.id}`
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dndId })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  }
  return (
    <div ref={setNodeRef} style={style} className="manage-item-row">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${item.label}`}
      />
      <span className="drag-handle" {...attributes} {...listeners}>
        <GripVertical size={16} aria-hidden="true" />
      </span>
      <span className="manage-item-label inline-icon-text">
        {item.icon && <item.icon size={15} className="home-icon" aria-hidden="true" />}
        {item.label}
      </span>
      {onEdit && (
        <button className="btn small" onClick={onEdit}>
          Edit
        </button>
      )}
      {onDuplicate && (
        <button className="btn small" onClick={onDuplicate}>
          Duplicate
        </button>
      )}
      <button className="btn small danger" onClick={onDelete}>
        Delete
      </button>
    </div>
  )
}

export default function ManageItemsModal({
  title,
  items,
  folders,
  onMoveToFolder,
  onReorder,
  onDelete,
  onBulkDelete,
  onCreateFolder,
  onRenameFolder,
  onGetFolderDeleteImpact,
  onDeleteFolderRecursive,
  onDeleteFolderPromoteContents,
  onEditItem,
  onDuplicateItem,
  disableEscapeClose,
  onClose
}: Props): JSX.Element {
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [folderQuery, setFolderQuery] = useState('')
  const [activeDndId, setActiveDndId] = useState<string | null>(null)
  const [folderDialog, setFolderDialog] = useState<FolderDialog | null>(null)
  const [dialogName, setDialogName] = useState('')
  const [itemDialog, setItemDialog] = useState<{
    item: ManagedItem
    studioImpact: { setupCount: number; templateCount: number } | null
  } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState<{
    items: ManagedItem[]
    studioImpact: { setupCount: number; templateCount: number }
  } | null>(null)

  // Escape closes whichever layer is on top: a delete/folder dialog if one's open, else clears an
  // active bulk selection, else closes the modal — never two layers from a single keypress.
  // (folderDialog/itemDialog/bulkDeleteDialog are mutually exclusive; only one confirm dialog is
  // ever open at a time.)
  const anyDialogOpen = folderDialog !== null || itemDialog !== null || bulkDeleteDialog !== null
  const hasSelection = selectedIds.size > 0
  useEscapeToClose(onClose, !anyDialogOpen && !hasSelection && !disableEscapeClose)
  useEscapeToClose(() => setSelectedIds(new Set()), !anyDialogOpen && hasSelection)
  useEscapeToClose(() => setFolderDialog(null), folderDialog !== null)
  useEscapeToClose(() => setItemDialog(null), itemDialog !== null)
  useEscapeToClose(() => setBulkDeleteDialog(null), bulkDeleteDialog !== null)

  function selectFolder(id: number | null): void {
    setSelectedFolderId(id)
    setSelectedIds(new Set())
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const tree = buildFolderTree(folders)
  const showFolderSearch = folders.length > 5
  const folderQ = folderQuery.trim().toLowerCase()
  const searchMatches = folderQ
    ? flattenFolderTreeForPicker(tree).filter((o) => o.folder.name.toLowerCase().includes(folderQ))
    : []
  const itemsHere = items.filter((item) => item.folderId === selectedFolderId)
  const kinds = [...new Set(itemsHere.map((item) => item.kind))]
  const activeItem = activeDndId ? items.find((i) => `${i.kind}-${i.id}` === activeDndId) : null

  function handleDragStart(event: DragStartEvent): void {
    setActiveDndId(String(event.active.id))
  }

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    setActiveDndId(null)
    const { active, over } = event
    if (!over) return

    const overId = String(over.id)
    const { kind: activeKind, id: activeId } = parseDndId(String(active.id))

    if (overId.startsWith('folder-')) {
      const targetFolderId = overId === 'folder-root' ? null : Number(overId.replace('folder-', ''))
      await onMoveToFolder(activeKind, activeId, targetFolderId)
      return
    }

    if (active.id === over.id) return
    const { kind: overKind } = parseDndId(overId)
    if (overKind !== activeKind) return

    const groupItems = itemsHere.filter((i) => i.kind === activeKind)
    const oldIndex = groupItems.findIndex((i) => `${i.kind}-${i.id}` === active.id)
    const newIndex = groupItems.findIndex((i) => `${i.kind}-${i.id}` === overId)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(groupItems, oldIndex, newIndex)
    await onReorder(activeKind, selectedFolderId, reordered.map((i) => i.id))
  }

  async function handleDeleteClick(id: number): Promise<void> {
    const folder = folders.find((f) => f.id === id)
    if (!folder) return
    const impact = await onGetFolderDeleteImpact(id)
    setFolderDialog({ kind: 'delete', id, name: folder.name, impact })
  }

  async function handleItemDelete(item: ManagedItem): Promise<void> {
    const studioImpact = item.kind === 'studio' ? await window.api.studios.getDeleteImpact(item.id) : null
    setItemDialog({ item, studioImpact })
  }

  async function confirmItemDelete(): Promise<void> {
    if (!itemDialog) return
    await onDelete(itemDialog.item.kind, itemDialog.item)
    setItemDialog(null)
  }

  function toggleItemSelect(item: ManagedItem): void {
    const key = `${item.kind}-${item.id}`
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAllHere(): void {
    setSelectedIds(new Set(itemsHere.map((item) => `${item.kind}-${item.id}`)))
  }

  function deselectAllHere(): void {
    setSelectedIds(new Set())
  }

  async function handleBulkDeleteClick(): Promise<void> {
    const selected = itemsHere.filter((item) => selectedIds.has(`${item.kind}-${item.id}`))
    if (selected.length === 0) return
    const studioIds = selected.filter((item) => item.kind === 'studio').map((item) => item.id)
    const impacts = await Promise.all(studioIds.map((id) => window.api.studios.getDeleteImpact(id)))
    const studioImpact = impacts.reduce(
      (sum, impact) => ({
        setupCount: sum.setupCount + impact.setupCount,
        templateCount: sum.templateCount + impact.templateCount
      }),
      { setupCount: 0, templateCount: 0 }
    )
    setBulkDeleteDialog({ items: selected, studioImpact })
  }

  async function confirmBulkDelete(): Promise<void> {
    if (!bulkDeleteDialog) return
    await onBulkDelete(bulkDeleteDialog.items)
    setSelectedIds(new Set())
    setBulkDeleteDialog(null)
  }

  function openCreateDialog(parentId: number | null): void {
    setDialogName('')
    setFolderDialog({ kind: 'create', parentId })
  }

  function openRenameDialog(id: number, currentName: string): void {
    setDialogName(currentName)
    setFolderDialog({ kind: 'rename', id, currentName })
  }

  async function submitFolderDialog(): Promise<void> {
    if (!folderDialog) return
    if (folderDialog.kind === 'create') {
      if (!dialogName.trim()) return
      await onCreateFolder(dialogName.trim(), folderDialog.parentId)
    } else if (folderDialog.kind === 'rename') {
      if (!dialogName.trim()) return
      await onRenameFolder(folderDialog.id, dialogName.trim())
    }
    setFolderDialog(null)
  }

  async function handleDeleteEverything(): Promise<void> {
    if (folderDialog?.kind !== 'delete') return
    await onDeleteFolderRecursive(folderDialog.id)
    if (selectedFolderId === folderDialog.id) setSelectedFolderId(null)
    setFolderDialog(null)
  }

  async function handleMoveContentsUp(): Promise<void> {
    if (folderDialog?.kind !== 'delete') return
    await onDeleteFolderPromoteContents(folderDialog.id)
    if (selectedFolderId === folderDialog.id) setSelectedFolderId(null)
    setFolderDialog(null)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal manage-modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="manage-layout">
            <div className="folder-tree-pane">
              {showFolderSearch && (
                <div className="folder-tree-search">
                  <input
                    placeholder="Search folders"
                    value={folderQuery}
                    onChange={(e) => setFolderQuery(e.target.value)}
                    aria-label="Search folders"
                  />
                </div>
              )}
              {folderQ ? (
                searchMatches.length > 0 ? (
                  searchMatches.map(({ folder }) => (
                    <FlatFolderRow
                      key={folder.id}
                      id={folder.id}
                      name={folder.name}
                      selected={selectedFolderId === folder.id}
                      onSelect={() => selectFolder(folder.id)}
                      onCreateSubfolder={() => openCreateDialog(folder.id)}
                      onRename={() => openRenameDialog(folder.id, folder.name)}
                      onDelete={() => handleDeleteClick(folder.id)}
                    />
                  ))
                ) : (
                  <div className="folder-picker-empty">No folders match “{folderQuery}”.</div>
                )
              ) : (
                <>
                  <RootFolderRow selected={selectedFolderId === null} onSelect={() => selectFolder(null)} />
                  {tree.map((node) => (
                    <FolderTreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      selectedFolderId={selectedFolderId}
                      onSelect={selectFolder}
                      onCreateSubfolder={openCreateDialog}
                      onRename={openRenameDialog}
                      onDelete={handleDeleteClick}
                    />
                  ))}
                  <button className="btn small" style={{ marginTop: 8 }} onClick={() => openCreateDialog(null)}>
                    + New folder
                  </button>
                </>
              )}
            </div>
            <div className="manage-list-pane">
              {itemsHere.length > 0 && (
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}
                >
                  <button className="btn small" onClick={selectAllHere}>
                    Select all
                  </button>
                  <button className="btn small" onClick={deselectAllHere}>
                    Deselect all
                  </button>
                  {selectedIds.size > 0 && (
                    <button className="btn small danger" onClick={handleBulkDeleteClick}>
                      Delete {selectedIds.size} selected
                    </button>
                  )}
                </div>
              )}
              {itemsHere.length === 0 ? (
                <div className="empty-state">Nothing in this folder yet.</div>
              ) : (
                kinds.map((kind) => {
                  const groupItems = itemsHere.filter((i) => i.kind === kind)
                  return (
                    <div key={kind}>
                      {kinds.length > 1 && (
                        <div className="manage-kind-heading">
                          {kind.charAt(0).toUpperCase() + kind.slice(1)}s
                        </div>
                      )}
                      <SortableContext
                        items={groupItems.map((i) => `${i.kind}-${i.id}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        {groupItems.map((item) => (
                          <SortableItemRow
                            key={`${item.kind}-${item.id}`}
                            item={item}
                            selected={selectedIds.has(`${item.kind}-${item.id}`)}
                            onToggleSelect={() => toggleItemSelect(item)}
                            onDelete={() => handleItemDelete(item)}
                            onEdit={onEditItem ? () => onEditItem(item) : undefined}
                            onDuplicate={onDuplicateItem ? () => onDuplicateItem(item) : undefined}
                          />
                        ))}
                      </SortableContext>
                    </div>
                  )
                })
              )}
            </div>
          </div>
          <DragOverlay>{activeItem ? <div className="manage-item-row">{activeItem.label}</div> : null}</DragOverlay>
        </DndContext>
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>

      {folderDialog && (folderDialog.kind === 'create' || folderDialog.kind === 'rename') && (
        <div className="modal-overlay" onClick={() => setFolderDialog(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 360 }}>
            <h2 style={{ marginTop: 0 }}>{folderDialog.kind === 'create' ? 'New Folder' : 'Rename Folder'}</h2>
            <div className="inline-form" style={{ marginTop: 0 }}>
              <input
                value={dialogName}
                onChange={(e) => setDialogName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitFolderDialog()}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setFolderDialog(null)}>
                Cancel
              </button>
              <button className="btn primary" onClick={submitFolderDialog} disabled={!dialogName.trim()}>
                {folderDialog.kind === 'create' ? 'Create' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}

      {folderDialog && folderDialog.kind === 'delete' && (
        <div className="modal-overlay" onClick={() => setFolderDialog(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <h2 style={{ marginTop: 0 }}>Delete "{folderDialog.name}"?</h2>
            <p className="card-sub">{describeFolderImpact(folderDialog.impact)}</p>
            <div className="modal-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => setFolderDialog(null)}>
                Cancel
              </button>
              <button className="btn" onClick={handleMoveContentsUp}>
                Move contents up
              </button>
              <button className="btn danger" onClick={handleDeleteEverything}>
                Delete everything
              </button>
            </div>
          </div>
        </div>
      )}

      {itemDialog && (
        <div className="modal-overlay" onClick={() => setItemDialog(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <h2 style={{ marginTop: 0 }}>Delete "{itemDialog.item.label}"?</h2>
            <p className="card-sub">
              {itemDialog.studioImpact && itemDialog.studioImpact.setupCount + itemDialog.studioImpact.templateCount > 0
                ? `This also deletes ${itemDialog.studioImpact.setupCount} setup${
                    itemDialog.studioImpact.setupCount === 1 ? '' : 's'
                  } and ${itemDialog.studioImpact.templateCount} template${
                    itemDialog.studioImpact.templateCount === 1 ? '' : 's'
                  } in this studio. This can't be undone.`
                : "This can't be undone."}
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setItemDialog(null)}>
                Cancel
              </button>
              <button className="btn danger" onClick={confirmItemDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteDialog && (
        <div className="modal-overlay" onClick={() => setBulkDeleteDialog(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <h2 style={{ marginTop: 0 }}>Delete {pluralize(bulkDeleteDialog.items.length, 'item')}?</h2>
            <p className="card-sub">
              {bulkDeleteDialog.studioImpact.setupCount + bulkDeleteDialog.studioImpact.templateCount > 0
                ? `This also deletes ${pluralize(bulkDeleteDialog.studioImpact.setupCount, 'setup')} and ${pluralize(
                    bulkDeleteDialog.studioImpact.templateCount,
                    'template'
                  )} across the selected studios. This can't be undone.`
                : "This can't be undone."}
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setBulkDeleteDialog(null)}>
                Cancel
              </button>
              <button className="btn danger" onClick={confirmBulkDelete}>
                Delete {bulkDeleteDialog.items.length}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
