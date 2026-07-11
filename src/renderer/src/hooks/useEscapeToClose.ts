import { useEffect } from 'react'

/** Closes a modal on Escape — pair with the same `.modal-overlay onClick={onClose}` prop every
 *  modal already uses for backdrop-click dismissal, so Escape and backdrop-click stay consistent.
 *  Pass `enabled: false` when a nested dialog is currently on top, so Escape closes only the
 *  topmost layer instead of both at once (see ManageItemsModal's folder dialogs for an example). */
export function useEscapeToClose(onClose: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, enabled])
}
