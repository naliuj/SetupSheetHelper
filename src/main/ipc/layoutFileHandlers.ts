import { BrowserWindow, ipcMain } from 'electron'
import { IPC, LAYOUT_FILE_CHANGED_CHANNEL } from '@shared/types/ipc'
import * as roomLayoutFileRepo from '../db/repositories/roomLayoutFileRepo'
import { getSetupLayoutOverride } from '../db/repositories/setupLayoutOverrideRepo'
import { getEffectiveLayoutForSetup } from '../db/repositories/effectiveLayoutRepo'
import {
  importLayoutFileForStudio,
  pickLayoutFile,
  commitPickedLayoutFileToStudio,
  commitPickedLayoutFileToSetup,
  setBlankLayoutForSetup,
  clearLayoutForSetup
} from '../pdf/importLayoutFile'

/** Tells every window a layout changed, so a canvas already showing it (the pop-out Layout window,
 *  the other pane of Split View) redraws instead of keeping the old floor plan until reopened. */
function broadcastLayoutFileChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(LAYOUT_FILE_CHANGED_CHANNEL)
}

/** Runs a layout change, then broadcasts it. */
async function changing<T>(change: () => T | Promise<T>): Promise<T> {
  const result = await change()
  broadcastLayoutFileChanged()
  return result
}

export function registerLayoutFileHandlers(): void {
  ipcMain.handle(IPC.layoutFile.getForStudio, (_e, studioId: number) =>
    roomLayoutFileRepo.getLayoutFileForStudio(studioId)
  )
  ipcMain.handle(IPC.layoutFile.importForStudio, (_e, studioId: number) =>
    changing(() => importLayoutFileForStudio(studioId))
  )
  ipcMain.handle(IPC.layoutFile.pickFile, () => pickLayoutFile())
  ipcMain.handle(IPC.layoutFile.commitPickedToStudio, (_e, studioId: number, sourcePath: string) =>
    changing(() => commitPickedLayoutFileToStudio(studioId, sourcePath))
  )
  ipcMain.handle(IPC.layoutFile.commitPickedToSetup, (_e, setupId: number, sourcePath: string) =>
    changing(() => commitPickedLayoutFileToSetup(setupId, sourcePath))
  )
  ipcMain.handle(IPC.layoutFile.setBlankForSetup, (_e, setupId: number) => changing(() => setBlankLayoutForSetup(setupId)))
  ipcMain.handle(IPC.layoutFile.getOverrideForSetup, (_e, setupId: number) => getSetupLayoutOverride(setupId))
  ipcMain.handle(IPC.layoutFile.clearOverrideForSetup, (_e, setupId: number) => changing(() => clearLayoutForSetup(setupId)))
  ipcMain.handle(IPC.layoutFile.getEffectiveForSetup, (_e, setupId: number | null, studioId: number) =>
    getEffectiveLayoutForSetup(setupId, studioId)
  )
}
