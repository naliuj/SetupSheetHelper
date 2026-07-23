import { useEffect, useMemo, useState } from 'react'
import type { Folder, Setup } from '@shared/types/setup'
import { buildFolderTree } from '@renderer/state/folderTree'
import ExportFolderTreeNode from '@renderer/components/ExportFolderTreeNode'

interface Props {
  onBack: () => void
}

export default function SetupExportPage({ onBack }: Props): JSX.Element {
  const [setups, setSetups] = useState<Setup[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    window.api.setups.list().then(setSetups)
    window.api.folders.list('setup').then(setFolders)
  }, [])

  const tree = useMemo(() => buildFolderTree(folders), [folders])
  const setupsByFolder = useMemo(() => {
    const map = new Map<number | null, Setup[]>()
    for (const setup of setups) {
      const list = map.get(setup.folderId) ?? []
      list.push(setup)
      map.set(setup.folderId, list)
    }
    return map
  }, [setups])
  const unfiledSetups = setupsByFolder.get(null) ?? []

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
      const result = await window.api.setups.exportToFile([...selectedIds])
      setMessage(result.canceled ? null : `Exported to ${result.filePath}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div className="nav-crumbs">
        <button onClick={onBack}>Settings</button> / Export Setups
      </div>
      <div className="inline-form" style={{ marginTop: 0 }}>
        <button className="btn small" onClick={() => setSelectedIds(new Set(setups.map((s) => s.id)))}>
          Select all
        </button>
        <button className="btn small" onClick={() => setSelectedIds(new Set())}>
          Deselect all
        </button>
      </div>
      {setups.length === 0 ? (
        <div className="empty-state">No setups to export yet.</div>
      ) : (
        <div className="panel" style={{ maxHeight: 320, overflow: 'auto' }}>
          {unfiledSetups.map((setup) => (
            <label key={setup.id} className="folder-tree-row" style={{ paddingLeft: 20, cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedIds.has(setup.id)} onChange={() => toggle(setup.id)} />
              {setup.name}
            </label>
          ))}
          {tree.map((node) => (
            <ExportFolderTreeNode
              key={node.id}
              node={node}
              depth={0}
              itemsByFolder={setupsByFolder}
              selectedIds={selectedIds}
              onToggleItem={toggle}
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
