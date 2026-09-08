import { app, BrowserWindow, dialog, net, protocol, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { closeDb, openDatabaseAtStartup } from './db'
import { registerAllIpcHandlers } from './ipc'
import { installAppMenu } from './menu'
import { initAutoUpdater } from './autoUpdater'
import { restoreBounds, saveBounds } from './windowBounds'

// Redirects EVERY on-disk trace of a run — database, room layouts, window bounds, Chromium's own
// caches — into a throwaway directory, so a demo or a screen recording gets a genuine first launch
// (onboarding, freshly seeded Berklee data, no setups) without touching real work. Set by
// `npm run dev:demo`; unset for a normal run, which keeps the standard userData path.
//
// Must run before ANYTHING reads a userData path — the database opens lazily on first IPC, but
// Electron also resolves cache/session paths off this early, so it stays at the very top of main.
const demoUserData = process.env['SETUP_SHEET_HELPER_USER_DATA']
if (demoUserData) {
  app.setPath('userData', demoUserData)
  app.setPath('sessionData', demoUserData)
}

// Two copies of the app on ONE profile quietly destroy each other's work. Saving a setup or a
// layout is a whole-list replace — every row not in the payload is deleted — so with both windows
// showing the same setup, whichever saves second deletes whatever the other just added, and
// neither window shows anything wrong until the next reload.
//
// Chromium keys this lock on the userData directory, which the redirect above has already
// applied, so `npm run dev:demo` still runs happily alongside a normal instance. Only a second
// instance on the SAME profile is turned away, handing focus to the one already running.
if (!app.requestSingleInstanceLock()) {
  app.exit(0)
}

app.on('second-instance', () => {
  const [existing] = BrowserWindow.getAllWindows()
  if (!existing) return
  if (existing.isMinimized()) existing.restore()
  existing.focus()
})

// Registered before app ready so the scheme is treated as secure/standard,
// letting pdfjs-dist fetch() the layout PDF bytes in the renderer without
// piping large buffers through ipcRenderer.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

function createWindow(): BrowserWindow {
  const savedBounds = restoreBounds('main')
  const mainWindow = new BrowserWindow({
    width: savedBounds?.width ?? 1400,
    height: savedBounds?.height ?? 900,
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
  saveBounds('main', mainWindow)

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  // Packaged builds get their icon from build.mac.icon (electron-builder) — this only covers the
  // Dock icon during `npm run dev`, since that runs the generic Electron binary rather than a
  // bundled app.
  if (!app.isPackaged && process.platform === 'darwin') {
    app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
  }

  protocol.handle('app-file', (request) => {
    // Registered as a "standard" scheme, so the URL always has a (placeholder) host — see the
    // matching renderer-side construction in LayoutBackground.tsx. Parse properly rather than
    // string-slicing so the real absolute path (a single percent-encoded segment) round-trips
    // correctly regardless of what the host segment happens to be.
    const url = new URL(request.url)
    const filePath = decodeURIComponent(url.pathname.slice(1))
    return net.fetch(pathToFileURL(filePath).toString())
  })

  // Open the database HERE rather than letting it happen lazily inside the first IPC call. A
  // failure (a migration that throws, an unreadable file) used to surface inside a renderer
  // promise that nothing catches: the window appeared, every query failed, and the user was
  // looking at an empty Home screen with no way to tell that from having lost their work.
  const dbError = openDatabaseAtStartup()
  if (dbError) {
    dialog.showErrorBox(
      'Setup Sheet Helper cannot open its database',
      `${dbError.message}\n\n` +
        'Your data has not been changed. A copy taken before the last update is in the ' +
        `"backups" folder next to the database:\n${app.getPath('userData')}\n\n` +
        'Send this message along with that folder and it can be recovered.'
    )
    app.exit(1)
    return
  }

  registerAllIpcHandlers()
  const mainWindow = createWindow()
  installAppMenu(mainWindow)
  initAutoUpdater(mainWindow)

  // installAppMenu is deliberately called only once: menu actions now target whichever window is
  // focused at click time (see menu.ts), so a later window doesn't need its own menu install.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Checkpoints the WAL back into the main database file. Skipping this left every quit with a
// stray -wal alongside the .sqlite, so anything reading that file on its own — a backup tool, one
// of the maintenance scripts — saw a database missing the most recent writes.
app.on('will-quit', () => {
  closeDb()
})
