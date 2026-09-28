import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'

/** Elements that can hold keyboard focus, in DOM order. Excludes anything disabled, explicitly
 *  removed from the tab order, or not rendered — a hidden trailing button would otherwise become a
 *  tab stop the trap wraps to and the user cannot see. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableWithin(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
  )
}

interface ModalDialogProps {
  ref: RefObject<HTMLDivElement | null>
  role: 'dialog'
  'aria-modal': true
  'aria-label': string
  tabIndex: -1
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
}

/** Dialog semantics and focus management for the app's modals — spread onto the `.modal` card,
 *  beside the props it already has.
 *
 *  A hook rather than a <Modal> wrapper component. The wrapper is the more usual shape, but every
 *  modal here is a hand-built overlay/card pair with its own heading, width and layout, and
 *  reshaping twenty-three of them to fit one component's idea of a dialog would be a large,
 *  entirely visual diff in service of an invisible change. This carries the same three fixes to
 *  each one by adding a line.
 *
 *  What it fixes, none of which any modal had:
 *
 *  - `role="dialog"` + `aria-modal` + a name. Without these a modal is an anonymous group of
 *    controls, and nothing tells a screen reader the rest of the page is inert behind it.
 *  - A focus trap. Tab from the last control used to walk straight out of the dialog and into the
 *    page behind the scrim, which is still visible, still clickable, and not what the user is
 *    looking at.
 *  - Focus restoration. Closing a modal dropped focus back to <body>, so the next Tab restarted
 *    from the top of the app rather than from the control that opened the dialog.
 *
 *  Escape is deliberately NOT taken over: useEscapeToClose already handles it per modal, and some
 *  modals layer several conditional handlers so only the topmost closes (see ManageItemsModal).
 *  Folding that in here would flatten a distinction those call sites are making on purpose.
 *
 *  Initial focus is only claimed when nothing inside has it already, because fifteen of these
 *  modals put `autoFocus` on the field the user should land in, and that fires first.
 *
 *  `active` exists for dialogs that are rendered conditionally from inside a parent that stays
 *  mounted — the confirm boxes nested in ManageItemsModal and PaletteEditor. A hook cannot be
 *  called conditionally, so those parents call it unconditionally and pass the condition; without
 *  it the focus effect would fire when the PARENT mounted, which is not when the dialog appears. */
export function useModalDialog(label: string, active = true): ModalDialogProps {
  const ref = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  // Captured during render rather than in the effect below, which is the whole trick here: React
  // applies a child's `autoFocus` during commit, and commit runs BEFORE effects. Read it from an
  // effect and document.activeElement is already the dialog's own first field, so "restore focus"
  // restores it to the dialog that just closed — which lands on <body>.
  if (active && openerRef.current === null) {
    openerRef.current = document.activeElement as HTMLElement | null
  }

  useEffect(() => {
    if (!active) return
    const card = ref.current
    if (card && !card.contains(document.activeElement)) {
      // The card itself is the fallback (hence tabIndex -1) for a dialog that is pure text.
      ;(focusableWithin(card)[0] ?? card).focus()
    }
    return () => {
      const opener = openerRef.current
      openerRef.current = null
      // Guarded: the opener can be gone by now — the row whose button opened a delete dialog is
      // exactly the thing the dialog deletes.
      if (opener?.isConnected) opener.focus()
    }
  }, [active])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== 'Tab') return
    const items = focusableWithin(ref.current)
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return { ref, role: 'dialog', 'aria-modal': true, 'aria-label': label, tabIndex: -1, onKeyDown }
}
