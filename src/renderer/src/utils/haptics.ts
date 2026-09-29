import type { HapticPattern } from '@shared/constants/haptics'

/** Taps the trackpad. The one call every snap and detent goes through.
 *
 *  Safe to call freely and from hot paths (drag ticks): off macOS it returns at once, and main
 *  throttles, honors the Settings toggle and does nothing without the native addon. Nothing is felt
 *  unless a finger is on a Force Touch trackpad — which is why callers only use it inside drags and
 *  pinches, where one is. */
export function haptic(pattern: HapticPattern): void {
  if (!window.api.haptics.supported) return
  window.api.haptics.perform(pattern)
}
