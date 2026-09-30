import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, StickyNote, Type } from 'lucide-react'
import { staggeredPosition } from '@shared/utils/staggeredGrid'
import { resolveLabelColor } from '@shared/constants/swatches'
import { hasNoteFill, NOTE_PRESETS, resolveNoteTextColor, type NotePreset } from '@shared/constants/layoutNotes'
import { useLayoutStoreState } from '@renderer/state/layoutStoreContext'
import { usePaletteStore } from '@renderer/state/paletteStore'
import { groupByCategory } from '@renderer/state/paletteGrouping'
import { useNavigationStore } from '@renderer/state/navigationStore'
import { endPaletteDrag, startPaletteDrag, usePaletteDragStore } from '@renderer/state/paletteDragStore'
import CustomBlockModal from './CustomBlockModal'

export default function InstrumentPalette(): JSX.Element {
  const blocks = useLayoutStoreState((s) => s.blocks)
  const addBlock = useLayoutStoreState((s) => s.addBlock)
  const requestNewNote = useLayoutStoreState((s) => s.requestNewNote)
  const paletteItems = usePaletteStore((s) => s.items)
  const goToSettings = useNavigationStore((s) => s.goToSettings)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  // Which card is being dragged, so it can look lifted while the canvas previews the block.
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const dragActive = usePaletteDragStore((s) => s.payload != null)
  const lifted = (key: string): boolean => dragActive && draggingKey === key

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

  function handleCustomBlockConfirm(
    title: string,
    color: string,
    personName: string | null,
    labelColor: string | null
  ): void {
    const { x, y } = staggeredPosition(blocks.length)
    addBlock({ label: title, shape: 'rect', color, x, y, personName, labelColor })
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
        Notes
      </div>
      {/* Real buttons, unlike the instrument cards below: dragging one places a note where it's
          dropped, and clicking (or Enter/Space) places it in the middle of the view — so a note can
          be added without a mouse. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
        {(['text', 'sticky'] as NotePreset[]).map((preset) => {
          const { label, color } = NOTE_PRESETS[preset]
          const filled = hasNoteFill(color)
          return (
            <button
              key={preset}
              type="button"
              draggable
              onDragStart={(e) => {
                setDraggingKey(`note:${preset}`)
                startPaletteDrag(e, { kind: 'note', preset, label, shape: 'rect', color })
              }}
              onDragEnd={endPaletteDrag}
              onClick={() => requestNewNote(preset)}
              className="btn small inline-icon-text"
              title={`Add ${preset === 'text' ? 'a text note' : 'a sticky note'} — or drag it onto the layout`}
              style={{
                width: '100%',
                justifyContent: 'center',
                cursor: 'grab',
                opacity: lifted(`note:${preset}`) ? 0.4 : undefined,
                ...(filled
                  ? { background: color, borderColor: color, color: resolveNoteTextColor(color, null) }
                  : { borderStyle: 'dashed' })
              }}
            >
              {filled ? <StickyNote size={13} aria-hidden="true" /> : <Type size={13} aria-hidden="true" />}
              {label}
            </button>
          )
        })}
      </div>
      <p className="card-sub" style={{ marginBottom: 0 }}>
        Type anywhere on the plan
      </p>

      <div className="section-title">Instruments</div>
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
              style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: 4 }}
            >
              {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />} {category}
            </div>
            {!isCollapsed &&
              items.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggingKey(`item:${item.id}`)
                    startPaletteDrag(e, {
                      label: item.label,
                      shape: item.shape,
                      color: item.color,
                      defaultWidth: item.defaultWidth,
                      defaultHeight: item.defaultHeight,
                      labelColor: item.labelColor
                    })
                  }}
                  onDragEnd={endPaletteDrag}
                  className="card"
                  style={{
                    marginBottom: 4,
                    cursor: 'grab',
                    opacity: lifted(`item:${item.id}`) ? 0.4 : undefined,
                    background: item.color,
                    color: resolveLabelColor(item.color, item.labelColor),
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
