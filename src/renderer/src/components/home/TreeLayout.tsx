import { useState } from 'react'
import type { FolderTreeNode } from '@shared/types/setup'
import { buildFolderTree } from '@renderer/state/folderTree'
import type { HomeEntry, HomeLayoutViewProps } from './HomeSection'
import EntryRow from './EntryRow'

/** File-tree layout: the whole folder hierarchy shown at once, folders expand/collapse, entries as
 *  leaf rows. No drill-down — everything is visible and navigable in place. */
export default function TreeLayout({ folders, entries, leadingItems, emptyMessage }: HomeLayoutViewProps): JSX.Element {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const tree = buildFolderTree(folders)
  const entriesByFolder = new Map<number | null, HomeEntry[]>()
  for (const e of entries) {
    const list = entriesByFolder.get(e.folderId) ?? []
    list.push(e)
    entriesByFolder.set(e.folderId, list)
  }

  const rootEntries = entriesByFolder.get(null) ?? []
  const isEmpty = tree.length === 0 && rootEntries.length === 0 && !leadingItems?.length

  function toggle(id: number): void {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderFolder(node: FolderTreeNode, depth: number): JSX.Element {
    const isCollapsed = collapsed.has(node.id)
    const childEntries = entriesByFolder.get(node.id) ?? []
    const hasChildren = node.children.length > 0 || childEntries.length > 0
    return (
      <div key={node.id}>
        <div className="folder-tree-row" style={{ paddingLeft: 10 + depth * 16 }}>
          {hasChildren ? (
            <button className="folder-tree-toggle" onClick={() => toggle(node.id)}>
              {isCollapsed ? '▸' : '▾'}
            </button>
          ) : (
            <span className="folder-tree-toggle" />
          )}
          <span className="folder-tree-label" style={{ cursor: 'default' }}>
            📁 {node.name}
          </span>
        </div>
        {!isCollapsed && (
          <>
            {node.children.map((child) => renderFolder(child, depth + 1))}
            {childEntries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} style={{ paddingLeft: 10 + (depth + 1) * 16 }} />
            ))}
          </>
        )}
      </div>
    )
  }

  if (isEmpty) return <div className="empty-state">{emptyMessage ?? 'Nothing here yet.'}</div>

  return (
    <div className="home-tree">
      {leadingItems?.map((item) => (
        <button
          key={item.id}
          type="button"
          className="folder-tree-row home-selectable"
          style={{ paddingLeft: 10 }}
          onClick={item.onActivate}
        >
          <span className="folder-tree-toggle" />📁 {item.label}
        </button>
      ))}
      {tree.map((node) => renderFolder(node, 0))}
      {rootEntries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} style={{ paddingLeft: 10 }} />
      ))}
    </div>
  )
}
