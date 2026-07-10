import { app, dialog, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

/** Wires up electron-updater against the GitHub Releases published by `npm run release:mac`
 *  (see package.json's `build.publish` config). No-ops in dev (unpackaged) since there's no
 *  packaged app-update.yml to read update feed info from. */
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

  autoUpdater.checkForUpdates()
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
