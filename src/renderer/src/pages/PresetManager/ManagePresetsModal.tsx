import { useEffect, useState } from 'react'
import type { ChannelPreset } from '@shared/types/channelPreset'
import type { Folder } from '@shared/types/setup'
import ManageItemsModal, { type ManagedItem } from '@renderer/components/ManageItemsModal'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

/** The preset manager dialog — reuses the generic ManageItemsModal (folder tree, drag-to-folder,
 *  drag-reorder, folder CRUD) against the SEPARATE preset-folder namespace, and adds a
 *  name/description edit dialog on top (ManageItemsModal has no item editor of its own). */
export default function ManagePresetsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [presets, setPresets] = useState<ChannelPreset[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [rowCounts, setRowCounts] = useState<Map<number, number>>(new Map())
  const [editing, setEditing] = useState<ChannelPreset | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  async function reload(): Promise<void> {
    const [list, folderList] = await Promise.all([window.api.presets.list(), window.api.presetFolders.list()])
    setPresets(list)
    setFolders(folderList)
    const counts = new Map<number, number>()
    await Promise.all(
      list.map(async (p) => {
        const withItems = await window.api.presets.getWithItems(p.id)
        counts.set(p.id, withItems?.items.length ?? 0)
      })
    )
    setRowCounts(counts)
  }

  useEffect(() => {
    reload()
  }, [])

  const items: ManagedItem[] = presets.map((p) => ({
    kind: 'preset',
    id: p.id,
    folderId: p.folderId,
    label: `${p.name} · ${rowCounts.get(p.id) ?? 0} row${rowCounts.get(p.id) === 1 ? '' : 's'}`
  }))

  function openEdit(item: ManagedItem): void {
    const preset = presets.find((p) => p.id === item.id)
    if (!preset) return
    setEditing(preset)
    setEditName(preset.name)
    setEditDescription(preset.description ?? '')
  }

  async function saveEdit(): Promise<void> {
    if (!editing || !editName.trim()) return
    await window.api.presets.rename(editing.id, editName.trim(), editDescription.trim() || null)
    setEditing(null)
    await reload()
  }

  useEscapeToClose(() => setEditing(null), editing !== null)

  return (
    <>
      <ManageItemsModal
        title="Manage presets"
        items={items}
        folders={folders}
        onMoveToFolder={async (_kind, id, folderId) => {
          await window.api.presets.moveToFolder(id, folderId)
          await reload()
        }}
        onReorder={async (_kind, _folderId, orderedIds) => {
          await window.api.presets.reorder(orderedIds)
          await reload()
        }}
        onDelete={async (_kind, item) => {
          await window.api.presets.remove(item.id)
          await reload()
        }}
        onBulkDelete={async (items) => {
          await window.api.presets.removeMany(items.map((item) => item.id))
          await reload()
        }}
        onCreateFolder={async (name, parentFolderId) => {
          await window.api.presetFolders.create(name, parentFolderId)
          await reload()
        }}
        onRenameFolder={async (id, name) => {
          await window.api.presetFolders.rename(id, name)
          await reload()
        }}
        onGetFolderDeleteImpact={(id) => window.api.presetFolders.getDeleteImpact(id)}
        onDeleteFolderRecursive={async (id) => {
          await window.api.presetFolders.deleteRecursive(id)
          await reload()
        }}
        onDeleteFolderPromoteContents={async (id) => {
          await window.api.presetFolders.deletePromoteContents(id)
          await reload()
        }}
        onEditItem={openEdit}
        disableEscapeClose={editing !== null}
        onClose={onClose}
      />

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 360 }}>
            <h2 style={{ marginTop: 0 }}>Edit preset</h2>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
              autoFocus
            />
            <input
              placeholder="Description (optional)"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              style={{ width: '100%' }}
            />
            <div className="modal-actions">
              <button className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn primary" onClick={saveEdit} disabled={!editName.trim()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
