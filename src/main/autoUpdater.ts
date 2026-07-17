import { app, dialog, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

/** How often to re-check for updates while the app stays open. electron-updater's own check only
 *  runs once at startup, so an app left running for days would never notice a new release — this
 *  keeps polling so a long-lived session still picks one up (and prompts) within a few hours. */
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours

/** Wires up electron-updater against the public setup-sheet-helper-releases GitHub Releases,
 *  published directly by `npm run release:mac` (see package.json's `build.publish` config) —
 *  a private repo's release feed 404s on unauthenticated requests, which is what every install
 *  would be making. No-ops in dev (unpackaged) since there's no packaged app-update.yml to read
 *  update feed info from. */
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  if (!app.isPackaged) return

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        message: `Setup Sheet Helper ${info.version} is ready to install.`,
        detail: 'Restart the app to finish updating.'
      })
      .then((result) => {
        if (result.response === 0) autoUpdater.quitAndInstall()
      })
  })

  autoUpdater.on('error', (err) => {
    console.error('autoUpdater error', err)
  })

  // checkForUpdates() rejects on network/feed errors (also surfaced via the 'error' event above),
  // so swallow the rejection here to avoid an unhandled promise rejection on every failed poll.
  const check = (): void => {
    autoUpdater.checkForUpdates().catch(() => {})
  }

  check() // once on launch
  // …then on an interval. Each 'update-downloaded' fires only once per version, so a user who
  // clicks "Later" isn't re-nagged for the same build; a genuinely newer release will download
  // and prompt again. autoInstallOnAppQuit still applies any staged update on the next quit.
  setInterval(check, UPDATE_CHECK_INTERVAL_MS)
}

/** "Check for Updates…" menu item — reports back if nothing was found, since the automatic
 *  startup check above stays silent unless there's actually something to install. */
export function checkForUpdatesManually(mainWindow: BrowserWindow): void {
  if (!app.isPackaged) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      message: 'Updates are only available in the installed app, not in development.'
    })
    return
  }

  autoUpdater.once('update-not-available', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      message: 'You\'re up to date.',
      detail: `Setup Sheet Helper ${app.getVersion()} is the latest version.`
    })
  })

  autoUpdater.once('error', (err) => {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      message: 'Couldn\'t check for updates.',
      detail: err.message
    })
  })

  autoUpdater.checkForUpdates()
}
