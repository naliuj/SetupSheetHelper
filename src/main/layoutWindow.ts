import { BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  IPC,
  LAYOUT_WINDOW_STATE_CHANNEL,
  LAYOUT_WINDOW_EXPORT_REQUEST_CHANNEL,
  LAYOUT_WINDOW_EXPORT_RESULT_CHANNEL,
  LAYOUT_WINDOW_FLUSH_REQUEST_CHANNEL,
  LAYOUT_WINDOW_FLUSH_ACK_CHANNEL,
  type LayoutWindowState,
  type LayoutWindowExportRequest,
  type LayoutWindowExportResult,
  type LayoutWindowFlushRequest,
  type LayoutWindowFlushAck
} from '@shared/types/ipc'
import { restoreBounds, saveBounds } from './windowBounds'

/** One relay timeout for both the export-image round trip and the close-flush handshake — a
 *  hung/unresponsive renderer must never leave the caller waiting forever (export would hang the
 *  main window's PDF export; flush would leave the layout window impossible to close). */
const RELAY_TIMEOUT_MS = 3000

/** Everything about the standalone Layout Mode window lives in this one module's closure — the
 *  window reference itself, which setup it's currently showing, and the pending cross-window
 *  request maps — rather than split across main/index.ts and main/ipc/*, since the window
 *  lifecycle and its IPC handlers all need the same state.
 *
 *  Deliberately a SINGLETON: one layout window app-wide, not one per setup. Popping out a
 *  different setup while one is already open re-targets the existing window instead of opening a
 *  second one — keeps this to "one canvas, one other display" rather than a general multi-window
 *  setup browser (a bigger, different feature). */
let layoutWin: BrowserWindow | null = null
let openForSetupId: number | null = null
let closingForFlush = false

const pendingExports = new Map<string, (dataUrl: string | null) => void>()
const pendingFlushAcks = new Map<string, () => void>()

function currentState(): LayoutWindowState {
  return { openForSetupId }
}

/** Pushed to every window (not just the one that asked) — the main window's toolbar needs to know
 *  regardless of which window triggered the change. */
function broadcastState(): void {
  const state = currentState()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(LAYOUT_WINDOW_STATE_CHANNEL, state)
  }
}

function loadLayoutWindow(win: BrowserWindow, setupId: number, studioId: number): void {
  const search = `?window=layout&setupId=${setupId}&studioId=${studioId}`
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${search}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { search })
  }
}

/** Asks `win`'s renderer to save any dirty layout state, then calls `onDone` — either once it
 *  acks, or after RELAY_TIMEOUT_MS if it never does (closed mid-request, hung). Shared by the
 *  close handler and the retarget path below: both are about to make the window's current content
 *  unreachable (destroyed, or navigated to a different setup), and both would silently drop the
 *  last few seconds of edits without this. */
function requestFlush(win: BrowserWindow, onDone: () => void): void {
  if (win.isDestroyed()) {
    onDone()
    return
  }
  const requestId = randomUUID()
  const timer = setTimeout(() => {
    pendingFlushAcks.delete(requestId)
    onDone()
  }, RELAY_TIMEOUT_MS)
  pendingFlushAcks.set(requestId, () => {
    clearTimeout(timer)
    onDone()
  })
  const request: LayoutWindowFlushRequest = { requestId }
  win.webContents.send(LAYOUT_WINDOW_FLUSH_REQUEST_CHANNEL, request)
}

function createLayoutWindow(setupId: number, studioId: number): BrowserWindow {
  const savedBounds = restoreBounds('layout')
  const win = new BrowserWindow({
    width: savedBounds?.width ?? 1100,
    height: savedBounds?.height ?? 800,
    x: savedBounds?.x,
    y: savedBounds?.y,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  saveBounds('layout', win)
  // This window is created from a button click in the MAIN window's renderer (via the IPC
  // handler below), not from the user directly activating it — on macOS, show() alone doesn't
  // reliably hand it OS keyboard focus in that case, which would silently leave every keybind
  // (undo, delete, zoom, …) unreachable from the keyboard despite the window being visibly in
  // front. focus() makes that explicit rather than hoping show()'s default behavior covers it.
  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })
  loadLayoutWindow(win, setupId, studioId)

  // The one place a raw window close needs an explicit flush: SetupEditor's existing
  // flush-on-unmount effect only fires on in-app React unmount (navigating away), never on the OS
  // close button — and this window has no other way to leave. Intercept once, ask the renderer to
  // save if dirty, then let the close proceed for real. closingForFlush guards against the
  // preventDefault()'d close re-entering this handler when we call win.close() ourselves below.
  win.on('close', (e) => {
    if (closingForFlush || win.webContents.isDestroyed()) return
    e.preventDefault()
    requestFlush(win, () => {
      closingForFlush = true
      win.close()
    })
  })

  win.on('closed', () => {
    layoutWin = null
    openForSetupId = null
    closingForFlush = false
    broadcastState()
  })

  return win
}

/** Opens the standalone window for `setupId`, or re-targets/focuses the existing one. Called only
 *  from the main window, and only after it's confirmed (via the same getEffectiveForSetup gate
 *  Table Mode's local toggle uses) that this setup has an effective room layout file — this module
 *  never runs that check itself. */
export function openLayoutWindow(setupId: number, studioId: number): void {
  if (layoutWin && !layoutWin.isDestroyed()) {
    const win = layoutWin
    if (openForSetupId !== setupId) {
      // Retargeting makes the window's CURRENT content (a different setup) unreachable the moment
      // loadLayoutWindow navigates it — flush that setup's edits first, the same reasoning as the
      // close handler above. Focus happens immediately regardless; the content swap lands a moment
      // later once the save round-trip (or its timeout) finishes.
      requestFlush(win, () => {
        if (win.isDestroyed()) return
        openForSetupId = setupId
        loadLayoutWindow(win, setupId, studioId)
        broadcastState()
      })
    }
    win.focus()
    return
  }
  layoutWin = createLayoutWindow(setupId, studioId)
  openForSetupId = setupId
  broadcastState()
}

export function focusLayoutWindow(): void {
  if (layoutWin && !layoutWin.isDestroyed()) layoutWin.focus()
}

/** Main-window side of the export relay (see konvaExport.ts's exportStageToDataUrl, which is what
 *  actually runs — inside the layout window, against ITS live Konva stage). Resolves null
 *  immediately if no layout window is open for this setup, or after RELAY_TIMEOUT_MS if the window
 *  doesn't reply (closed mid-request, or its renderer is hung) — either way the caller (PDF export
 *  in SetupToolbar.tsx) treats null as "couldn't get the room layout" and degrades gracefully,
 *  exactly as if the local hidden stage were simply missing. */
export function requestExportImage(setupId: number, pixelRatio: number, monochrome: boolean): Promise<string | null> {
  if (!layoutWin || layoutWin.isDestroyed() || openForSetupId !== setupId) return Promise.resolve(null)
  const win = layoutWin
  return new Promise((resolve) => {
    const requestId = randomUUID()
    const timer = setTimeout(() => {
      pendingExports.delete(requestId)
      resolve(null)
    }, RELAY_TIMEOUT_MS)
    pendingExports.set(requestId, (dataUrl) => {
      clearTimeout(timer)
      resolve(dataUrl)
    })
    const request: LayoutWindowExportRequest = { requestId, pixelRatio, monochrome }
    win.webContents.send(LAYOUT_WINDOW_EXPORT_REQUEST_CHANNEL, request)
  })
}

export function registerLayoutWindowHandlers(): void {
  ipcMain.handle(IPC.layoutWindow.open, (_e, setupId: number, studioId: number) => {
    openLayoutWindow(setupId, studioId)
  })
  ipcMain.handle(IPC.layoutWindow.focus, () => {
    focusLayoutWindow()
  })
  ipcMain.handle(IPC.layoutWindow.getState, () => currentState())
  ipcMain.handle(IPC.layoutWindow.requestExportImage, (_e, setupId: number, pixelRatio: number, monochrome: boolean) =>
    requestExportImage(setupId, pixelRatio, monochrome)
  )

  ipcMain.on(LAYOUT_WINDOW_EXPORT_RESULT_CHANNEL, (_e, result: LayoutWindowExportResult) => {
    pendingExports.get(result.requestId)?.(result.dataUrl)
    pendingExports.delete(result.requestId)
  })
  ipcMain.on(LAYOUT_WINDOW_FLUSH_ACK_CHANNEL, (_e, ack: LayoutWindowFlushAck) => {
    pendingFlushAcks.get(ack.requestId)?.()
  })
}
