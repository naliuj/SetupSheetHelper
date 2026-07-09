import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { computeUsedByOthers } from '@renderer/state/usageCounts'
import { stripManufacturerPrefix } from '@shared/utils/manufacturerPrefix'

export interface PickerItem {
  id: number
  name: string
  manufacturer: string | null
}

interface MenuNode<T extends PickerItem> {
  key: string
  label: string
  children?: MenuNode<T>[]
  item?: T
}

interface Props<T extends PickerItem> {
  items: T[]
  usageCounts: Map<number, number>
  getQuantity: (item: T) => number
  selectedId: number | null
  onSelect: (id: number | null) => void
  outerGroupBy?: (item: T) => string
  outerGroupOrder?: string[]
  placeholder?: string
  /** Whether to show the "X/Y in use" badge — only meaningful when picking items into one session. Defaults to true. */
  showUsage?: boolean
  /** Drop the manufacturer prefix from the selected item's name in the collapsed trigger
   *  (e.g. "API 2500 Bus Compressor" shows as "2500 Bus Compressor"). Defaults to false. */
  stripManufacturerInTrigger?: boolean
}

const MENU_WIDTH = 220
const MENU_MAX_HEIGHT = 320

function groupByManufacturer<T extends PickerItem>(list: T[]): MenuNode<T>[] {
  const buckets = new Map<string, T[]>()
  for (const item of list) {
    const key = item.manufacturer?.trim() || 'Other'
    const arr = buckets.get(key) ?? []
    arr.push(item)
    buckets.set(key, arr)
  }
  const keys = [...buckets.keys()].filter((k) => k !== 'Other').sort((a, b) => a.localeCompare(b))
  if (buckets.has('Other')) keys.push('Other')

  return keys.map((key) => ({
    key: `mfr-${key}`,
    label: key,
    children: (buckets.get(key) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => ({
        key: `item-${item.id}`,
        label: key === 'Other' ? item.name : stripManufacturerPrefix(item.name, key),
        item
      }))
  }))
}

function buildMenuTree<T extends PickerItem>(
  items: T[],
  outerGroupBy?: (item: T) => string,
  outerGroupOrder?: string[]
): MenuNode<T>[] {
  if (!outerGroupBy) return groupByManufacturer(items)

  const outerBuckets = new Map<string, T[]>()
  for (const item of items) {
    const key = outerGroupBy(item)
    const arr = outerBuckets.get(key) ?? []
    arr.push(item)
    outerBuckets.set(key, arr)
  }

  const orderedKeys = outerGroupOrder
    ? [
        ...outerGroupOrder.filter((k) => outerBuckets.has(k)),
        ...[...outerBuckets.keys()].filter((k) => !outerGroupOrder.includes(k))
      ]
    : [...outerBuckets.keys()]

  return orderedKeys.map((key) => ({
    key: `grp-${key}`,
    label: key,
    children: groupByManufacturer(outerBuckets.get(key) ?? [])
  }))
}

interface Rect {
  top: number
  left: number
  bottom: number
  right: number
}

function clampPosition(anchor: Rect, mode: 'below' | 'right'): { top: number; left: number } {
  let top = mode === 'below' ? anchor.bottom : anchor.top
  let left = mode === 'below' ? anchor.left : anchor.right

  if (left + MENU_WIDTH > window.innerWidth) {
    left = mode === 'below' ? Math.max(8, anchor.right - MENU_WIDTH) : Math.max(8, anchor.left - MENU_WIDTH)
  }
  if (top + MENU_MAX_HEIGHT > window.innerHeight) {
    top = Math.max(8, window.innerHeight - MENU_MAX_HEIGHT - 8)
  }
  return { top, left }
}

export default function ManufacturerPickerDropdown<T extends PickerItem>({
  items,
  usageCounts,
  getQuantity,
  selectedId,
  onSelect,
  outerGroupBy,
  outerGroupOrder,
  placeholder = '—',
  showUsage = true,
  stripManufacturerInTrigger = false
}: Props<T>): JSX.Element {
  const [open, setOpen] = useState(false)
  const [hoverPath, setHoverPath] = useState<string[]>([])
  // Which level of the tree Up/Down/Enter currently act on — distinct from how many levels
  // are visually cascading open (hoverPath can show a deeper level's items without keyboard
  // nav having "entered" it yet, e.g. after Left backs out of it but it's still showing).
  const [activeDepth, setActiveDepth] = useState(0)
  const [search, setSearch] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const selectedItem = items.find((i) => i.id === selectedId) ?? null
  const tree = buildMenuTree(items, outerGroupBy, outerGroupOrder)

  const trimmedSearch = search.trim().toLowerCase()
  const searchResults = trimmedSearch
    ? items
        .filter(
          (item) =>
            item.name.toLowerCase().includes(trimmedSearch) ||
            (item.manufacturer ?? '').toLowerCase().includes(trimmedSearch)
        )
        .sort((a, b) => a.name.localeCompare(b.name))
    : null

  useEffect(() => {
    if (!open) return

    function handleMouseDown(e: MouseEvent): void {
      const target = e.target as Node
      if (containerRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close()
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        close()
        return
      }
      if (searchResults) {
        handleSearchKeyDown(e)
      } else {
        handleTreeKeyDown(e)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
    // handleKeyDown reads hoverPath/searchResults (derived from search) directly from this
    // closure rather than a ref, so the listener must be re-created whenever they change —
    // otherwise arrow-key presses after the first would act on a stale hoverPath.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hoverPath, activeDepth, search])

  function close(): void {
    setOpen(false)
    setHoverPath([])
    setActiveDepth(0)
    setSearch('')
  }

  function handleLeafClick(item: T): void {
    const used = computeUsedByOthers(usageCounts, selectedId, item.id)
    if (used >= getQuantity(item)) return
    onSelect(item.id)
    close()
  }

  function setHoverAtDepth(depth: number, key: string): void {
    setHoverPath((prev) => [...prev.slice(0, depth), key])
  }

  // The nodes list keyboard nav is currently cycling through — resolved by walking hoverPath
  // down exactly `depth` steps from the root, independent of how much further hoverPath
  // itself cascades (that's just visual — see activeDepth's comment above).
  function nodesAtDepth(depth: number): MenuNode<T>[] {
    let nodes = tree
    for (let d = 0; d < depth; d++) {
      const found = nodes.find((n) => n.key === hoverPath[d])
      if (!found?.children) return []
      nodes = found.children
    }
    return nodes
  }

  function handleTreeKeyDown(e: KeyboardEvent): void {
    if (!open) return
    const nodes = nodesAtDepth(activeDepth)

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (nodes.length === 0) return
      e.preventDefault()
      const currentIndex = nodes.findIndex((n) => n.key === hoverPath[activeDepth])
      let nextIndex: number
      if (currentIndex === -1) {
        nextIndex = e.key === 'ArrowDown' ? 0 : nodes.length - 1
      } else {
        nextIndex = e.key === 'ArrowDown' ? currentIndex + 1 : currentIndex - 1
        if (nextIndex < 0) nextIndex = nodes.length - 1
        if (nextIndex >= nodes.length) nextIndex = 0
      }
      setHoverAtDepth(activeDepth, nodes[nextIndex].key)
      return
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const currentNode = nodes.find((n) => n.key === hoverPath[activeDepth])
      if (!currentNode) {
        if (nodes.length > 0) setHoverAtDepth(activeDepth, nodes[0].key)
        return
      }
      if (currentNode.children && currentNode.children.length > 0) {
        const firstChild = currentNode.children[0]
        setHoverPath((prev) => [...prev.slice(0, activeDepth + 1), firstChild.key])
        setActiveDepth(activeDepth + 1)
      }
      return
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (activeDepth > 0) {
        setHoverPath((prev) => prev.slice(0, activeDepth))
        setActiveDepth(activeDepth - 1)
      }
      return
    }

    if (e.key === 'Enter') {
      const currentNode = nodes.find((n) => n.key === hoverPath[activeDepth])
      if (!currentNode) return
      e.preventDefault()
      if (currentNode.item) {
        handleLeafClick(currentNode.item)
      } else if (currentNode.children && currentNode.children.length > 0) {
        const firstChild = currentNode.children[0]
        setHoverPath((prev) => [...prev.slice(0, activeDepth + 1), firstChild.key])
        setActiveDepth(activeDepth + 1)
      }
    }
  }

  function handleSearchKeyDown(e: KeyboardEvent): void {
    if (!searchResults || searchResults.length === 0) return
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter') return
    e.preventDefault()

    const keys = searchResults.map((item) => `search-${item.id}`)
    const currentIndex = keys.indexOf(hoverPath[0])

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      let nextIndex: number
      if (currentIndex === -1) {
        nextIndex = e.key === 'ArrowDown' ? 0 : keys.length - 1
      } else {
        nextIndex = e.key === 'ArrowDown' ? currentIndex + 1 : currentIndex - 1
        if (nextIndex < 0) nextIndex = keys.length - 1
        if (nextIndex >= keys.length) nextIndex = 0
      }
      setHoverPath([keys[nextIndex]])
      return
    }

    const targetIndex = currentIndex === -1 ? 0 : currentIndex
    const item = searchResults[targetIndex]
    if (item) handleLeafClick(item)
  }

  function renderSearchRow(): React.ReactNode {
    return (
      <input
        key="search"
        type="text"
        className="picker-menu-search"
        placeholder="Search…"
        value={search}
        autoFocus
        onChange={(e) => setSearch(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      />
    )
  }

  function renderItemRow(item: T, key: string, isHighlighted = false): React.ReactNode {
    const used = computeUsedByOthers(usageCounts, selectedId, item.id)
    const quantity = getQuantity(item)
    const atCapacity = used >= quantity
    const isSelected = item.id === selectedId

    return (
      <div
        key={key}
        className={`picker-menu-row ${isHighlighted ? 'hovered' : ''} ${atCapacity ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`}
        onClick={() => {
          if (!atCapacity) handleLeafClick(item)
        }}
      >
        <span>
          {item.name}
          {item.manufacturer && <span className="picker-menu-row-hint"> — {item.manufacturer}</span>}
        </span>
        {showUsage && quantity > 1 && (
          <span className="picker-menu-row-suffix">
            {used}/{quantity} in use
          </span>
        )}
      </div>
    )
  }

  function renderSearchResults(anchor: Rect): React.ReactNode {
    const pos = clampPosition(anchor, 'below')
    return (
      <div
        className="picker-menu"
        style={{ position: 'fixed', top: pos.top, left: pos.left, width: MENU_WIDTH, maxHeight: MENU_MAX_HEIGHT }}
      >
        {renderSearchRow()}
        {searchResults!.length === 0 ? (
          <div className="picker-menu-row-hint" style={{ padding: '6px 8px' }}>
            No matches
          </div>
        ) : (
          searchResults!.map((item) => renderItemRow(item, `search-${item.id}`, hoverPath[0] === `search-${item.id}`))
        )}
      </div>
    )
  }

  function renderLevel(nodes: MenuNode<T>[], depth: number, anchor: Rect, mode: 'below' | 'right'): React.ReactNode {
    const pos = clampPosition(anchor, mode)
    const hoveredKey = hoverPath[depth]

    const levelDiv = (
      <div
        key={`level-${depth}`}
        className="picker-menu"
        style={{ position: 'fixed', top: pos.top, left: pos.left, width: MENU_WIDTH, maxHeight: MENU_MAX_HEIGHT }}
      >
        {depth === 0 && renderSearchRow()}
        {nodes.map((node) => {
          const isLeaf = !!node.item
          const isHovered = hoveredKey === node.key
          const used = isLeaf ? computeUsedByOthers(usageCounts, selectedId, node.item!.id) : 0
          const quantity = isLeaf ? getQuantity(node.item!) : 1
          const atCapacity = isLeaf && used >= quantity
          const isSelected = isLeaf && node.item!.id === selectedId

          return (
            <div
              key={node.key}
              ref={(el) => {
                if (el) rowRefs.current.set(`${depth}:${node.key}`, el)
                else rowRefs.current.delete(`${depth}:${node.key}`)
              }}
              className={`picker-menu-row ${isHovered ? 'hovered' : ''} ${atCapacity ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`}
              onMouseEnter={() => {
                setHoverAtDepth(depth, node.key)
                setActiveDepth(depth)
              }}
              onClick={() => {
                if (isLeaf && !atCapacity) handleLeafClick(node.item!)
              }}
            >
              <span>{node.label}</span>
              {showUsage && isLeaf && quantity > 1 && (
                <span className="picker-menu-row-suffix">
                  {used}/{quantity} in use
                </span>
              )}
              {!isLeaf && <span className="picker-menu-row-caret">›</span>}
            </div>
          )
        })}
      </div>
    )

    let nested: React.ReactNode = null
    if (hoveredKey) {
      const hoveredNode = nodes.find((n) => n.key === hoveredKey)
      if (hoveredNode?.children) {
        const rowEl = rowRefs.current.get(`${depth}:${hoveredKey}`)
        const rect = rowEl?.getBoundingClientRect()
        if (rect) {
          nested = renderLevel(hoveredNode.children, depth + 1, rect, 'right')
        }
      }
    }

    return (
      <>
        {levelDiv}
        {nested}
      </>
    )
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="picker-trigger"
        onClick={() => {
          if (open) {
            close()
          } else {
            setOpen(true)
          }
        }}
      >
        {selectedItem
          ? stripManufacturerInTrigger && selectedItem.manufacturer
            ? stripManufacturerPrefix(selectedItem.name, selectedItem.manufacturer)
            : selectedItem.name
          : placeholder}
      </button>
      {open &&
        triggerRef.current &&
        createPortal(
          <div ref={containerRef}>
            {searchResults
              ? renderSearchResults(triggerRef.current.getBoundingClientRect())
              : renderLevel(tree, 0, triggerRef.current.getBoundingClientRect(), 'below')}
          </div>,
          document.body
        )}
    </>
  )
}
