import { useMemo, useState } from 'react'
import { INSTRUMENT_TYPES, type InstrumentTypeDef } from '@shared/constants/instrumentTypes'
import { staggeredPosition } from '@shared/utils/staggeredGrid'
import { useLayoutStore } from '@renderer/state/layoutStore'
import CustomBlockModal from './CustomBlockModal'

export default function InstrumentPalette(): JSX.Element {
  const blocks = useLayoutStore((s) => s.blocks)
  const addBlock = useLayoutStore((s) => s.addBlock)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const item of INSTRUMENT_TYPES) set.add(item.category)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [])

  const query = search.trim().toLowerCase()
  const grouped = useMemo(() => {
    const map = new Map<string, InstrumentTypeDef[]>()
    for (const item of INSTRUMENT_TYPES) {
      if (query && !item.label.toLowerCase().includes(query)) continue
      const list = map.get(item.category) ?? []
      list.push(item)
      map.set(item.category, list)
    }
    return categories.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }))
  }, [categories, query])

  function toggleCategory(category: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  function handleCustomBlockConfirm(title: string, color: string): void {
    const { x, y } = staggeredPosition(blocks.length)
    addBlock(title, 'rect', color, x, y)
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

      <button className="btn small" style={{ width: '100%', marginBottom: 10 }} onClick={() => setModalOpen(true)}>
        + Add Custom Block
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
              style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}
            >
              {isCollapsed ? '▸' : '▾'} {category}
            </div>
            {!isCollapsed &&
              items.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData(
                      'application/json',
                      JSON.stringify({ label: item.label, shape: item.shape, color: item.color })
                    )
                  }
                  className="card"
                  style={{ marginBottom: 6, cursor: 'grab', background: item.color, color: '#fff' }}
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
