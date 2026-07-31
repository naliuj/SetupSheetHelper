import { screen, type BrowserWindow, type Rectangle } from 'electron'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { getSetting, setSetting } from './db/repositories/settingsRepo'

type WindowRole = 'main' | 'layout'

const SETTINGS_KEY: Record<WindowRole, string> = {
  main: APP_SETTINGS_KEYS.mainWindowBounds,
  layout: APP_SETTINGS_KEYS.layoutWindowBounds
}

const SAVE_DEBOUNCE_MS = 500

function isRectangle(value: unknown): value is Rectangle {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (['x', 'y', 'width', 'height'] as const).every((k) => typeof r[k] === 'number')
}

/** The saved rect for a window role, or null if there's nothing saved or it's on a display that
 *  isn't connected right now. A dual-monitor user's second window very plausibly was last
 *  positioned on a display that isn't attached this launch (laptop undocked, monitor off) —
 *  restoring blindly would open a window with no way to reach it, so this only returns a rect
 *  that overlaps a CURRENTLY connected display. */
export function restoreBounds(role: WindowRole): Rectangle | null {
  const raw = getSetting(SETTINGS_KEY[role])
  if (!raw) return null
  let rect: unknown
  try {
    rect = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRectangle(rect)) return null
  const onScreen = screen.getAllDisplays().some((display) => {
    const d = display.bounds
    return rect.x < d.x + d.width && rect.x + rect.width > d.x && rect.y < d.y + d.height && rect.y + rect.height > d.y
  })
  return onScreen ? rect : null
}

/** Persists `win`'s bounds under `role` on resize/move (debounced, so dragging doesn't hammer
 *  SQLite on every mousemove) and once more, synchronously, on close — the final position after a
 *  drag-then-release lands inside the debounce window otherwise and would be lost. */
export function saveBounds(role: WindowRole, win: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | null = null

  function persistNow(): void {
    if (win.isDestroyed()) return
    setSetting(SETTINGS_KEY[role], JSON.stringify(win.getBounds()))
  }

  function scheduleSave(): void {
    if (timer) clearTimeout(timer)
    timer = setTimeout(persistNow, SAVE_DEBOUNCE_MS)
  }

  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    persistNow()
  })
}
