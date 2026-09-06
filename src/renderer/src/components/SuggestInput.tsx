import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** A suggestion shows `label` but inserts `value`. They differ so the list can stay searchable by
 *  brand ("Neumann U87") while what lands in the field is just the model ("U87") — the manufacturer
 *  has its own column on the sheet, so repeating it in the mic cell is noise. */
export interface Suggestion {
  label: string
  value: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  /** Plain strings are accepted for the common case where the label IS the value. */
  suggestions: (Suggestion | string)[]
}

const MENU_WIDTH = 220
const MENU_MAX_HEIGHT = 260
const MAX_SUGGESTIONS = 20

/** A plain text input with a filtered suggestion popup. Quick Setup's free-text mic/outboard/
 *  preamp fields used to be a native <input list> + <datalist> — but Chromium renders its own
 *  combobox-style dropdown button on those and won't let author CSS hide it (::-webkit-list-button
 *  ignores `display: none`), so it always read as "this is a select" no matter the styling. This
 *  is a from-scratch replacement: no button/affordance at all, and no "browse everything" popup on
 *  focus either — suggestions only appear once the user has actually typed something, which is the
 *  behavior that's meant to read as a plain text box rather than a dropdown. */
export default function SuggestInput({ value, onChange, onBlur, placeholder, suggestions }: Props): JSX.Element {
  const [focused, setFocused] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const normalized: Suggestion[] = suggestions.map((s) => (typeof s === 'string' ? { label: s, value: s } : s))
  const query = value.trim().toLowerCase()
  const filtered = query
    ? normalized.filter((s) => s.label.toLowerCase().includes(query)).slice(0, MAX_SUGGESTIONS)
    : []
  const showPopup = focused && filtered.length > 0

  // Only the pick-a-suggestion path inserts `value`; plain typing still passes through verbatim,
  // so a name the user types themselves is never rewritten under them.
  function selectSuggestion(s: Suggestion): void {
    onChange(s.value)
    setFocused(false)
    setHighlightIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (!showPopup) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => (i + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1))
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault()
      selectSuggestion(filtered[highlightIndex])
    } else if (e.key === 'Escape') {
      setHighlightIndex(-1)
      setFocused(false)
    }
  }

  // Fixed-position portal to document.body (same technique as ManufacturerPickerDropdown) so the
  // popup isn't clipped by the setup sheet table's own scroll container.
  function popupPosition(): { top: number; left: number } {
    const rect = inputRef.current!.getBoundingClientRect()
    let left = rect.left
    let top = rect.bottom + 2
    if (left + MENU_WIDTH > window.innerWidth) left = Math.max(8, window.innerWidth - MENU_WIDTH - 8)
    if (top + MENU_MAX_HEIGHT > window.innerHeight) top = Math.max(8, rect.top - MENU_MAX_HEIGHT - 2)
    return { top, left }
  }

  return (
    <>
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          setFocused(true)
          setHighlightIndex(-1)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          setHighlightIndex(-1)
          onBlur?.()
        }}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
      />
      {showPopup &&
        createPortal(
          <div
            className="picker-menu"
            style={{ position: 'fixed', width: MENU_WIDTH, maxHeight: MENU_MAX_HEIGHT, ...popupPosition() }}
            // Selecting a suggestion shouldn't blur the input first (that would close the popup via
            // showPopup before the click lands) — same trick ManufacturerPickerDropdown's search
            // results use.
            onMouseDown={(e) => e.preventDefault()}
          >
            {filtered.map((s, i) => (
              <div
                key={s.label}
                className={`picker-menu-row${i === highlightIndex ? ' hovered' : ''}`}
                onMouseEnter={() => setHighlightIndex(i)}
                onClick={() => selectSuggestion(s)}
              >
                <span>{s.label}</span>
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}
