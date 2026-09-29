import { ipcMain } from 'electron'
import haptics from 'setup-sheet-haptics'
import { HAPTICS_PERFORM_CHANNEL, IPC } from '@shared/types/ipc'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { isHapticPattern } from '@shared/constants/haptics'
import { getSetting, setSetting } from './db/repositories/settingsRepo'

/** Trackpad haptic feedback. Electron has no API for it, so this drives AppKit's
 *  NSHapticFeedbackManager through the tiny native addon in native/haptics — see haptics.mm.
 *
 *  Lives in main because that is the only process that can load a native addon here, and because it
 *  keeps the on/off setting in one place for every window. The renderer only ever says WHICH
 *  pattern; main decides whether anything happens.
 *
 *  Nothing is felt unless a finger is on a Force Touch trackpad, and macOS drops the feedback
 *  itself when the user has turned it off in System Settings — so every caller fires and forgets. */

/** Two taps closer together than this read as one buzz, not two distinct events. */
const MIN_INTERVAL_MS = 30

const debug = process.env.SETUP_SHEET_HELPER_HAPTICS_DEBUG === '1'
let enabled: boolean | null = null
let lastPerformedAt = 0

function isEnabled(): boolean {
  // Read lazily, not at import, because the settings table isn't open until the database is.
  // Absent means on: haptics are opt-out, like the system setting they sit under.
  if (enabled == null) enabled = getSetting(APP_SETTINGS_KEYS.trackpadHaptics) !== '0'
  return enabled
}

function setEnabled(on: boolean): void {
  enabled = on
  setSetting(APP_SETTINGS_KEYS.trackpadHaptics, on ? '1' : '0')
}

export function registerHapticsHandlers(): void {
  ipcMain.on(HAPTICS_PERFORM_CHANNEL, (_event, pattern: unknown) => {
    if (!isHapticPattern(pattern) || !isEnabled()) return
    const now = Date.now()
    if (now - lastPerformedAt < MIN_INTERVAL_MS) return
    lastPerformedAt = now
    haptics.perform(pattern)
    if (debug) console.log(`[haptics] ${pattern}${haptics.available ? '' : ' (addon unavailable)'}`)
  })
  ipcMain.handle(IPC.haptics.getEnabled, () => isEnabled())
  ipcMain.handle(IPC.haptics.setEnabled, (_e, on: boolean) => setEnabled(on === true))
}
