import { app, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The page every window serves, without search or hash: the dev server URL under
 *  `electron-vite dev`, the bundled index.html in a packaged build. Only origin + pathname matter
 *  for the comparison below — the Layout window carries `?window=layout&setupId=…` and a reload
 *  keeps whatever query it had, and neither of those is a navigation away from the app. */
function appPageKey(): string {
  const url = process.env['ELECTRON_RENDERER_URL']
    ? new URL(process.env['ELECTRON_RENDERER_URL'])
    : // pathToFileURL, not string concatenation: this has to equal the URL loadFile builds for the
      // same path, percent-encoding included, or the packaged app would block its own page.
      pathToFileURL(join(__dirname, '../renderer/index.html'))
  return url.origin + url.pathname
}

function isAppPage(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.origin + parsed.pathname === appPageKey()
  } catch {
    return false
  }
}

/** Keeps every window on the app's own page and sends any other URL to the system browser.
 *
 *  Chromium's default for a file dropped somewhere no handler accepts it is to NAVIGATE the window
 *  to that file: dragging a PDF from Finder onto Home or a setup sheet replaced the whole UI with
 *  a PDF viewer, and only a reload brought the app back. will-navigate is the one hook that sees
 *  that before it happens. It does not fire for loadURL/loadFile from main (the Layout window's
 *  retarget path) or for in-page hash changes, so those need no allowance here.
 *
 *  Hooked once on the app rather than in createWindow and createLayoutWindow separately, for the
 *  same reason as initAccessibility: a window added later cannot forget it. The window-open
 *  handler lives here for that reason too — it used to be set only on the main window, so a
 *  `window.open` from the pop-out Layout window would have spawned a bare Electron window. */
export function initWindowGuards(): void {
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('will-navigate', (event, url) => {
      if (!isAppPage(url)) event.preventDefault()
    })
    win.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })
  })
}
