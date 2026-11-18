import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react'
import type { SetupItemDraft } from '@shared/types/setup'
import { useSetupStoreState } from '@renderer/state/setupStoreContext'
import { useModalDialog } from '@renderer/hooks/useModalDialog'
import { useBufferedField } from './useBufferedField'

interface Props {
  item: SetupItemDraft
  /** 0-based band number. */
  bandIndex: number
  bandCount: number
  /** Rows in this band, divider excluded. */
  rowCount: number
  collapsed: boolean
  colSpan: number
  /** Extra content after the band fields (the changeover summary). */
  children?: ReactNode
  onChange(id: number | string, patch: Partial<SetupItemDraft>): void
}

/** The full-width row that starts a band: its name, start time and notes, a fold chevron and a
 *  menu. A sortable item like every row so the table's drag layout stays consistent, but disabled:
 *  rows are dragged across a divider, the divider itself doesn't move. */
function BandDividerRow({ item, bandIndex, bandCount, rowCount, collapsed, colSpan, children, onChange }: Props): JSX.Element {
  const toggleBandCollapsed = useSetupStoreState((s) => s.toggleBandCollapsed)
  const removeBand = useSetupStoreState((s) => s.removeBand)
  const removeBandDivider = useSetupStoreState((s) => s.removeBandDivider)
  const setFocusedBand = useSetupStoreState((s) => s.setFocusedBand)
  const { setNodeRef, transform, transition } = useSortable({ id: item.id, disabled: true })

  const name = useBufferedField(item.sourceName, (v) => onChange(item.id, { sourceName: v }))
  const startTime = useBufferedField(item.startTime ?? '', (v) => onChange(item.id, { startTime: v.trim() || null }))
  const notes = useBufferedField(item.notes ?? '', (v) => onChange(item.id, { notes: v.trim() || null }))

  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const label = item.sourceName.trim() || `Band ${bandIndex + 1}`
  const isFirst = bandIndex === 0

  return (
    <tr
      ref={setNodeRef}
      className="band-divider-row"
      data-band-index={bandIndex}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <td colSpan={colSpan}>
        <div className="band-divider">
          <button
            className="icon-btn"
            onClick={() => toggleBandCollapsed(bandIndex)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Show ${label}` : `Fold ${label}`}
            title={collapsed ? `Show ${rowCount} row${rowCount === 1 ? '' : 's'}` : 'Fold this band'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
          <input
            className="band-divider-name"
            aria-label="Band name"
            placeholder={`Band ${bandIndex + 1}`}
            value={name.value}
            onChange={(e) => name.onChange(e.target.value)}
            onBlur={name.onBlur}
          />
          <input
            className="band-divider-time"
            aria-label="Start time"
            placeholder="Start time"
            value={startTime.value}
            onChange={(e) => startTime.onChange(e.target.value)}
            onBlur={startTime.onBlur}
          />
          <input
            className="band-divider-notes"
            aria-label="Band notes"
            placeholder="Band notes"
            value={notes.value}
            onChange={(e) => notes.onChange(e.target.value)}
            onBlur={notes.onBlur}
          />
          {collapsed && (
            <span className="band-divider-count">
              {rowCount} row{rowCount === 1 ? '' : 's'}
            </span>
          )}
          {children}
          <div ref={menuRef} style={{ position: 'relative', marginLeft: 'auto' }}>
            <button
              className="icon-btn"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={`${label} options`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div className="picker-menu" role="menu" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, minWidth: 220, zIndex: 20 }}>
                <div
                  className="picker-menu-row"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setFocusedBand(bandIndex)
                  }}
                >
                  Show only this band
                </div>
                {!isFirst && (
                  <div
                    className="picker-menu-row"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      removeBandDivider(item.id)
                    }}
                  >
                    Merge into previous band
                  </div>
                )}
                {isFirst && bandCount === 1 && (
                  <div
                    className="picker-menu-row"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      removeBandDivider(item.id)
                    }}
                  >
                    Remove divider
                  </div>
                )}
                {bandCount > 1 && (
                  <div
                    className="picker-menu-row"
                    role="menuitem"
                    style={{ color: 'var(--color-danger)' }}
                    onClick={() => {
                      setMenuOpen(false)
                      setConfirmRemove(true)
                    }}
                  >
                    Remove band…
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {confirmRemove && (
          <RemoveBandDialog
            label={label}
            rowCount={rowCount}
            onCancel={() => setConfirmRemove(false)}
            onConfirm={() => {
              setConfirmRemove(false)
              removeBand(item.id)
            }}
          />
        )}
      </td>
    </tr>
  )
}

function RemoveBandDialog({
  label,
  rowCount,
  onCancel,
  onConfirm
}: {
  label: string
  rowCount: number
  onCancel(): void
  onConfirm(): void
}): JSX.Element {
  const dialog = useModalDialog(`Remove ${label}?`)
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" {...dialog} onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <h2 style={{ marginTop: 0 }}>Remove {label}?</h2>
        <p className="card-sub" style={{ marginTop: 0 }}>
          This removes the band and its {rowCount} row{rowCount === 1 ? '' : 's'}. You can undo it right after.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn danger" onClick={onConfirm}>
            Remove band
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(BandDividerRow)
