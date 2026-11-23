import { useEffect, useRef, type FocusEvent, type KeyboardEvent } from 'react'

const ITEMS = '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)'

/** Keyboard behavior for a menu button and its popup menu, spread onto the element that wraps BOTH
 *  the trigger button and the `role="menu"` list: the first item takes focus when the menu opens
 *  (pass something that changes, like a step name, as `focusKey` to refocus when its content
 *  swaps), Up/Down/Home/End move between items, Escape closes and returns focus to the trigger,
 *  and Tabbing out of the wrapper closes it (Tab still reaches other controls inside it). Items must be real buttons
 *  with a menuitem role so Enter and Space activate them. */
export function useMenuKeyboard(
  open: boolean,
  close: () => void,
  focusKey?: unknown
): {
  ref: React.RefObject<HTMLDivElement | null>
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
  onBlur: (e: FocusEvent<HTMLDivElement>) => void
} {
  const ref = useRef<HTMLDivElement>(null)

  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLElement>(ITEMS)?.focus()
    // Choosing an item unmounts it while focused, dropping focus to <body>; put it back on the
    // trigger unless the item moved focus somewhere on purpose (a dialog it opened).
    else if (wasOpen.current && (document.activeElement === document.body || !document.activeElement))
      ref.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus()
    wasOpen.current = open
  }, [open, focusKey])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (!open) return
    if (e.key === 'Escape') {
      // Stop here so a dialog's or the editor's own Escape handling doesn't also fire.
      e.preventDefault()
      e.stopPropagation()
      close()
      ref.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    // Arrows on anything else in the menu (a drag handle mid keyboard-drag, a switch) are theirs.
    if (!(e.target as HTMLElement).matches(ITEMS)) return
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])]
    if (items.length === 0) return
    e.preventDefault()
    const at = items.indexOf(document.activeElement as HTMLElement)
    const next =
      e.key === 'Home' ? 0
      : e.key === 'End' ? items.length - 1
      : e.key === 'ArrowDown' ? (at + 1) % items.length
      : (at <= 0 ? items.length : at) - 1
    items[next].focus()
  }

  function onBlur(e: FocusEvent<HTMLDivElement>): void {
    // Only when focus lands somewhere real: a mouse press on an item blurs with no relatedTarget on
    // macOS (buttons don't take focus on click), and closing then would swallow the click. Mouse
    // presses outside are the caller's existing mousedown handler's job.
    const to = e.relatedTarget as Node | null
    if (open && to && !ref.current?.contains(to)) close()
  }

  return { ref, onKeyDown, onBlur }
}
