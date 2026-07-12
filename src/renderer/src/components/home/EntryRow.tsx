import type { CSSProperties } from 'react'
import type { HomeEntry } from './HomeSection'

/** A compact one-line entry row shared by the tree, two-pane, and columns layouts: icon + label,
 *  an optional right-aligned meta (date / "Studio"), and an optional hover action (e.g. a studio's
 *  "Edit inventory"). */
export default function EntryRow({
  entry,
  style,
  selected
}: {
  entry: HomeEntry
  style?: CSSProperties
  selected?: boolean
}): JSX.Element {
  return (
    <div className={`home-row${selected ? ' selected' : ''}`} style={style}>
      <button type="button" className="home-row-main" onClick={entry.onActivate}>
        <span className="home-row-label">{entry.icon ? `${entry.icon} ${entry.label}` : entry.label}</span>
        {entry.meta && <span className="home-row-meta">{entry.meta}</span>}
      </button>
      {entry.secondaryAction && (
        <button
          type="button"
          className="home-row-action"
          title={entry.secondaryAction.label}
          aria-label={entry.secondaryAction.label}
          onClick={entry.secondaryAction.onClick}
        >
          ✎
        </button>
      )}
    </div>
  )
}
