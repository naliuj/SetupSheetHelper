import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { APP_FLUSH_ACK_CHANNEL, APP_FLUSH_REQUEST_CHANNEL, type AppFlushAck } from '@shared/types/ipc'

/** Long enough for a save that is already in flight to land, short enough that a hung or crashed
 *  renderer cannot make the app feel unquittable. Matches the layout window's own close relay. */
const FLUSH_TIMEOUT_MS = 3000

const pendingAcks = new Map<string, () => void>()

/** Have we already flushed and re-issued the quit? Guards the second pass through before-quit
 *  from preventing the quit all over again. */
let flushed = false

function askWindowToFlush(win: BrowserWindow): Promise<void> {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return Promise.resolve()
  return new Promise((resolve) => {
    const requestId = randomUUID()
    const timer = setTimeout(() => {
      pendingAcks.delete(requestId)
      resolve()
    }, FLUSH_TIMEOUT_MS)
    pendingAcks.set(requestId, () => {
      clearTimeout(timer)
      resolve()
    })
    win.webContents.send(APP_FLUSH_REQUEST_CHANNEL, { requestId })
  })
}

/** Gives every open window a chance to write unsaved editor state before the app exits.
 *
 *  The standalone Layout window already intercepted its own close, because closing it is the only
 *  way to leave it. Nothing covered quitting: autosave is debounced, so Cmd+Q with a timer still
 *  armed dropped whatever was in it, silently — and the pane's flush-on-unmount effect does not
 *  run on quit either, since the process is going away rather than React unmounting.
 *
 *  Waits for every window in parallel, each with its own timeout, so one unresponsive renderer
 *  cannot hold up the others or block the quit indefinitely. */
export function installQuitFlush(): void {
  ipcMain.on(APP_FLUSH_ACK_CHANNEL, (_event, ack: AppFlushAck) => {
    const resolve = pendingAcks.get(ack.requestId)
    if (!resolve) return
    pendingAcks.delete(ack.requestId)
    resolve()
  })

  app.on('before-quit', (event) => {
    if (flushed) return
    const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
    if (windows.length === 0) return

    event.preventDefault()
    Promise.all(windows.map(askWindowToFlush)).finally(() => {
      flushed = true
      app.quit()
    })
  })
}
