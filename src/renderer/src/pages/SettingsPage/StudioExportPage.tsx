import { useEffect, useMemo, useState } from 'react'
import type { Studio } from '@shared/types/entities'
import type { Folder } from '@shared/types/setup'
import { buildFolderTree } from '@renderer/state/folderTree'
import ExportFolderTreeNode from '@renderer/components/ExportFolderTreeNode'

interface Props {
  onBack: () => void
}

export default function StudioExportPage({ onBack }: Props): JSX.Element {
  const [studios, setStudios] = useState<Studio[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    // Only custom studios support folders — the real building-bound studios are built-in app
    // content, not user-created studios meant to be shared/exported.
    window.api.studios.listCustom().then(setStudios)
    window.api.folders.list('studio').then(setFolders)
  }, [])

  const tree = useMemo(() => buildFolderTree(folders), [folders])
  const studiosByFolder = useMemo(() => {
    const map = new Map<number | null, Studio[]>()
    for (const studio of studios) {
      const list = map.get(studio.folderId) ?? []
      list.push(studio)
      map.set(studio.folderId, list)
    }
    return map
  }, [studios])
  const unfiledStudios = studiosByFolder.get(null) ?? []

  function toggle(id: number): void {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectFolder(ids: number[]): void {
    setSelectedIds((prev) => new Set([...prev, ...ids]))
  }

  async function handleExport(): Promise<void> {
    setExporting(true)
    setMessage(null)
    try {
      const result = await window.api.studios.exportToFile([...selectedIds])
      setMessage(result.canceled ? null : `Exported to ${result.filePath}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div className="nav-crumbs">
        <button onClick={onBack}>Settings</button> / Export Studios
      </div>
      <div className="inline-form" style={{ marginTop: 0 }}>
        <button className="btn small" onClick={() => setSelectedIds(new Set(studios.map((s) => s.id)))}>
          Select all
        </button>
        <button className="btn small" onClick={() => setSelectedIds(new Set())}>
          Deselect all
        </button>
      </div>
      {studios.length === 0 ? (
        <div className="empty-state">No studios to export yet.</div>
      ) : (
        <div className="panel" style={{ maxHeight: 320, overflow: 'auto' }}>
          {unfiledStudios.map((studio) => (
            <label key={studio.id} className="folder-tree-row" style={{ paddingLeft: 20, cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedIds.has(studio.id)} onChange={() => toggle(studio.id)} />
              {studio.name}
            </label>
          ))}
          {tree.map((node) => (
            <ExportFolderTreeNode
              key={node.id}
              node={node}
              depth={0}
              studiosByFolder={studiosByFolder}
              selectedIds={selectedIds}
              onToggleStudio={toggle}
              onSelectFolder={selectFolder}
            />
          ))}
        </div>
      )}
      {message && <p className="card-sub">{message}</p>}
      <div className="modal-actions">
        <button className="btn primary" onClick={handleExport} disabled={exporting || selectedIds.size === 0}>
          {exporting ? 'Exporting…' : 'Export selected'}
        </button>
      </div>
    </div>
  )
}
