import { app, BrowserWindow, ipcMain } from 'electron'
import {
  ACCESSIBILITY_CHANGED_CHANNEL,
  ACCESSIBILITY_SYNC_CHANNEL,
  IPC,
  type AccessibilityStateMessage
} from '@shared/types/ipc'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import {
  parseContrastPreference,
  parseUiScale,
  serializeUiScale,
  steppedUiScale,
  type ContrastPreference
} from '@shared/constants/accessibility'
import { getSetting, setSetting } from './db/repositories/settingsRepo'

/** Accessibility preferences live in main for the first of the three reasons theme.ts gives: every
 *  window has to agree, and only main can reach them all. A window that read the setting once at
 *  its own startup would leave an open pop-out Layout window on the old value until it was
 *  reopened — exactly the bug the theme broadcast was added to fix.
 *
 *  The OTHER two theme reasons do not apply, which is why this file is so much shorter: there is no
 *  nativeTheme equivalent to own (CSS resolves 'system' itself, via `@media (prefers-contrast:
 *  more)`), and nothing here themes Electron's own dialogs. */

function storedUiScale(): number {
  return parseUiScale(getSetting(APP_SETTINGS_KEYS.uiScale))
}

export function currentAccessibilityState(): AccessibilityStateMessage {
  return {
    contrast: parseContrastPreference(getSetting(APP_SETTINGS_KEYS.contrastPreference)),
    uiScale: storedUiScale()
  }
}

function broadcastAccessibility(): void {
  const state = currentAccessibilityState()
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    // Applied here rather than in the renderer: the zoom factor belongs to the webContents, so this
    // is the only place that can reach the pop-out Layout window too.
    win.webContents.setZoomFactor(state.uiScale)
    win.webContents.send(ACCESSIBILITY_CHANGED_CHANNEL, state)
  }
}

function setContrastPreference(preference: ContrastPreference): void {
  setSetting(APP_SETTINGS_KEYS.contrastPreference, preference)
  broadcastAccessibility()
}

function setUiScale(factor: number): void {
  setSetting(APP_SETTINGS_KEYS.uiScale, serializeUiScale(parseUiScale(String(factor))))
  broadcastAccessibility()
}

/** The View menu's Zoom In / Zoom Out / Actual Size.
 *
 *  These go through the same stored setting as the Settings picker rather than through Electron's
 *  stock zoomIn/zoomOut roles, which is the whole reason menu.ts no longer uses `role: 'viewMenu'`.
 *  The roles change the live zoom factor without telling anyone, so the menu and Settings would
 *  disagree the moment either was used, and nothing would survive a restart. */
export function stepUiScale(direction: 'in' | 'out' | 'reset'): void {
  const next = direction === 'reset' ? 1 : steppedUiScale(storedUiScale(), direction)
  if (next === storedUiScale()) return
  setUiScale(next)
}

/** Applies the stored scale to every window as it appears.
 *
 *  Hooked once on the app rather than in createWindow and createLayoutWindow separately, so a
 *  window added later cannot forget it. The did-finish-load re-assert is the load-bearing half:
 *  Chromium resets a webContents' zoom factor on navigation, so a factor set at construction time
 *  is discarded the moment the page actually loads. */
export function initAccessibility(): void {
  app.on('browser-window-created', (_event, win) => {
    const apply = (): void => {
      if (!win.isDestroyed()) win.webContents.setZoomFactor(storedUiScale())
    }
    apply()
    win.webContents.on('did-finish-load', apply)
  })
}

export function registerAccessibilityHandlers(): void {
  ipcMain.handle(IPC.accessibility.setContrast, (_e, preference: ContrastPreference) =>
    setContrastPreference(parseContrastPreference(preference))
  )
  ipcMain.handle(IPC.accessibility.setUiScale, (_e, factor: number) => setUiScale(factor))
  // Synchronous on purpose — see ACCESSIBILITY_SYNC_CHANNEL. One SQLite read against an
  // already-open handle, once per window, so the renderer can set data-contrast before first paint.
  ipcMain.on(ACCESSIBILITY_SYNC_CHANNEL, (event) => {
    event.returnValue = currentAccessibilityState()
  })
}
