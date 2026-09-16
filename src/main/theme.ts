import { BrowserWindow, ipcMain, nativeTheme } from 'electron'
import {
  IPC,
  THEME_CHANGED_CHANNEL,
  THEME_SYNC_CHANNEL,
  type ThemeStateMessage
} from '@shared/types/ipc'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { parseThemePreference, THEME_BACKGROUNDS, type ThemePreference } from '@shared/constants/theme'
import { getSetting, setSetting } from './db/repositories/settingsRepo'

/** The theme lives in main rather than in each renderer, for three reasons that only became
 *  obvious once "Follow OS" was on the table.
 *
 *  1. Every window has to agree. Each window used to read the setting once at its own startup and
 *     never hear about changes, so toggling the theme left an open pop-out Layout window on the
 *     old one until it was closed and reopened. That needed a main-to-all-windows broadcast
 *     whatever drove it, so putting the OS listener here costs nothing extra.
 *  2. The pre-paint bootstrap (THEME_SYNC_CHANNEL) has to be answerable before any renderer
 *     exists, which rules out asking a renderer's matchMedia.
 *  3. `nativeTheme.themeSource` takes the same three-value union we store, resolves it in one
 *     expression, AND themes Electron's own surfaces — notably the save dialogs both export paths
 *     open. A renderer-side matchMedia would also end up observing OUR override rather than the
 *     OS, since Chromium reports themeSource back through prefers-color-scheme. */

function storedPreference(): ThemePreference {
  return parseThemePreference(getSetting(APP_SETTINGS_KEYS.theme))
}

export function currentThemeState(): ThemeStateMessage {
  return {
    preference: storedPreference(),
    resolved: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }
}

/** For BrowserWindow's `backgroundColor`, which needs a literal at construction time. */
export function themeBackgroundColor(): string {
  return THEME_BACKGROUNDS[currentThemeState().resolved]
}

function broadcastTheme(): void {
  const state = currentThemeState()
  const background = THEME_BACKGROUNDS[state.resolved]
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    // Keeps the colour Chromium paints into not-yet-rendered areas (a fast resize, a new pop-out)
    // matching the theme, rather than leaving whatever the window was born with.
    win.setBackgroundColor(background)
    win.webContents.send(THEME_CHANGED_CHANNEL, state)
  }
}

function setThemePreference(preference: ThemePreference): void {
  setSetting(APP_SETTINGS_KEYS.theme, preference)
  nativeTheme.themeSource = preference
  // Explicit, even though assigning themeSource usually fires 'updated' by itself: going from
  // 'dark' to 'system' on a dark Mac changes the PREFERENCE without changing shouldUseDarkColors,
  // so nothing would fire and the Settings picker in other windows would not catch up. A second
  // broadcast is idempotent.
  broadcastTheme()
}

export function initTheme(): void {
  nativeTheme.themeSource = storedPreference()
  nativeTheme.on('updated', broadcastTheme)
}

export function registerThemeHandlers(): void {
  ipcMain.handle(IPC.theme.set, (_e, preference: ThemePreference) =>
    setThemePreference(parseThemePreference(preference))
  )
  // Synchronous on purpose — see THEME_SYNC_CHANNEL. One SQLite read against an already-open
  // handle, once per window, so the renderer can set data-theme before its first paint.
  ipcMain.on(THEME_SYNC_CHANNEL, (event) => {
    event.returnValue = currentThemeState()
  })
}
