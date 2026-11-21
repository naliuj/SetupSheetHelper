import { useEffect, useRef } from 'react'

/** Closes a modal on Escape — pair with the same `.modal-overlay onClick={onClose}` prop every
 *  modal already uses for backdrop-click dismissal, so Escape and backdrop-click stay consistent.
 *  Pass `enabled: false` when a nested dialog is currently on top, so Escape closes only the
 *  topmost layer instead of both at once (see ManageItemsModal's folder dialogs for an example). */
export function useEscapeToClose(onClose: () => void, enabled = true): void {
  // The listener is added once and reads the latest onClose from a ref. Re-adding it whenever
  // onClose changed (every render, for an inline arrow) broke Escape: when another Escape listener
  // re-rendered the modal mid-keypress (Clear Selection does), the browser skipped the re-added
  // listener for that event, so the dialog never closed.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!enabled) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled])
}
