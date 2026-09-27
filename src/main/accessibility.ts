import { BrowserWindow, ipcMain } from 'electron'
import {
  ACCESSIBILITY_CHANGED_CHANNEL,
  ACCESSIBILITY_SYNC_CHANNEL,
  IPC,
  type AccessibilityStateMessage
} from '@shared/types/ipc'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { parseContrastPreference, type ContrastPreference } from '@shared/constants/accessibility'
import { getSetting, setSetting } from './db/repositories/settingsRepo'

/** Accessibility preferences live in main for the first of the three reasons theme.ts gives: every
 *  window has to agree, and only main can reach them all. A window that read the setting once at
 *  its own startup would leave an open pop-out Layout window on the old value until it was
 *  reopened — exactly the bug the theme broadcast was added to fix.
 *
 *  The OTHER two theme reasons do not apply, which is why this file is so much shorter: there is no
 *  nativeTheme equivalent to own (CSS resolves 'system' itself, via `@media (prefers-contrast:
 *  more)`), and nothing here themes Electron's own dialogs. */

export function currentAccessibilityState(): AccessibilityStateMessage {
  return { contrast: parseContrastPreference(getSetting(APP_SETTINGS_KEYS.contrastPreference)) }
}

function broadcastAccessibility(): void {
  const state = currentAccessibilityState()
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send(ACCESSIBILITY_CHANGED_CHANNEL, state)
  }
}

function setContrastPreference(preference: ContrastPreference): void {
  setSetting(APP_SETTINGS_KEYS.contrastPreference, preference)
  broadcastAccessibility()
}

export function registerAccessibilityHandlers(): void {
  ipcMain.handle(IPC.accessibility.setContrast, (_e, preference: ContrastPreference) =>
    setContrastPreference(parseContrastPreference(preference))
  )
  // Synchronous on purpose — see ACCESSIBILITY_SYNC_CHANNEL. One SQLite read against an
  // already-open handle, once per window, so the renderer can set data-contrast before first paint.
  ipcMain.on(ACCESSIBILITY_SYNC_CHANNEL, (event) => {
    event.returnValue = currentAccessibilityState()
  })
}
