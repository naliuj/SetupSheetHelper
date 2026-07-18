import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { staggeredPosition } from '@shared/utils/staggeredGrid'
import { readableTextColor } from '@shared/constants/swatches'
import { useLayoutStore } from '@renderer/state/layoutStore'
import { usePaletteStore } from '@renderer/state/paletteStore'
import { groupByCategory } from '@renderer/state/paletteGrouping'
import { useNavigationStore } from '@renderer/state/navigationStore'
import CustomBlockModal from './CustomBlockModal'

export default function InstrumentPalette(): JSX.Element {
  const blocks = useLayoutStore((s) => s.blocks)
  const addBlock = useLayoutStore((s) => s.addBlock)
  const paletteItems = usePaletteStore((s) => s.items)
  const goToSettings = useNavigationStore((s) => s.goToSettings)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)

  // Categories follow the palette's custom order (first appearance in sortOrder), matching the
  // Settings palette editor — not alphabetical. groupByCategory preserves that encounter order.
  const query = search.trim().toLowerCase()
  const grouped = useMemo(() => {
    const filtered = query ? paletteItems.filter((item) => item.label.toLowerCase().includes(query)) : paletteItems
    return groupByCategory(filtered)
  }, [query, paletteItems])

  function toggleCategory(category: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  function handleCustomBlockConfirm(title: string, color: string, personName: string | null): void {
    const { x, y } = staggeredPosition(blocks.length)
    addBlock(title, 'rect', color, x, y, undefined, undefined, personName)
  }

  return (
    <div
      style={{
        width: 200,
        flexShrink: 0,
        borderRight: '1px solid var(--color-border)',
        padding: 10,
        overflowY: 'auto'
      }}
    >
      <div className="section-title" style={{ marginTop: 0 }}>
        Instruments
      </div>
      <p className="card-sub">Drag onto the layout — optional, purely visual</p>

      <button className="btn small" style={{ width: '100%', marginBottom: 6 }} onClick={() => setModalOpen(true)}>
        + Add custom block
      </button>
      <button className="btn small" style={{ width: '100%', marginBottom: 10 }} onClick={() => goToSettings()}>
        Manage palette…
      </button>

      <input
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', marginBottom: 10 }}
      />
      {grouped.map(({ category, items }) => {
        const isCollapsed = !query && collapsed.has(category)
        return (
          <div key={category} style={{ marginBottom: 8 }}>
            <div
              onClick={() => toggleCategory(category)}
              className="inline-icon-text"
              style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}
            >
              {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />} {category}
            </div>
            {!isCollapsed &&
              items.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData(
                      'application/json',
                      JSON.stringify({
                        label: item.label,
                        shape: item.shape,
                        color: item.color,
                        defaultWidth: item.defaultWidth,
                        defaultHeight: item.defaultHeight
                      })
                    )
                  }
                  className="card"
                  style={{
                    marginBottom: 4,
                    cursor: 'grab',
                    background: item.color,
                    color: readableTextColor(item.color),
                    padding: '5px 8px',
                    fontSize: 12
                  }}
                >
                  {item.label}
                </div>
              ))}
          </div>
        )
      })}

      {modalOpen && <CustomBlockModal onClose={() => setModalOpen(false)} onConfirm={handleCustomBlockConfirm} />}
    </div>
  )
}
