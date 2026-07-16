import { app, BrowserWindow, net, protocol, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerAllIpcHandlers } from './ipc'
import { installAppMenu } from './menu'
import { initAutoUpdater } from './autoUpdater'

// Registered before app ready so the scheme is treated as secure/standard,
// letting pdfjs-dist fetch() the layout PDF bytes in the renderer without
// piping large buffers through ipcRenderer.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

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

  registerAllIpcHandlers()
  const mainWindow = createWindow()
  installAppMenu(mainWindow)
  initAutoUpdater(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWindow = createWindow()
      installAppMenu(newWindow)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
