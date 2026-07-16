import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  suggestions: string[]
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

  const query = value.trim().toLowerCase()
  const filtered = query ? suggestions.filter((s) => s.toLowerCase().includes(query)).slice(0, MAX_SUGGESTIONS) : []
  const showPopup = focused && filtered.length > 0

  function selectSuggestion(s: string): void {
    onChange(s)
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
                key={s}
                className={`picker-menu-row${i === highlightIndex ? ' hovered' : ''}`}
                onMouseEnter={() => setHighlightIndex(i)}
                onClick={() => selectSuggestion(s)}
              >
                <span>{s}</span>
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}
