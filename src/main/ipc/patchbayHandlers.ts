import { BrowserWindow, ipcMain } from 'electron'
import { IPC, PATCHBAY_CHANGED_CHANNEL } from '@shared/types/ipc'
import type { PatchbayCableDraft } from '@shared/types/patchbay'
import { listCablesBySetup, replaceCablesForSetup } from '../db/repositories/patchbayCablesRepo'
import {
  commitPickedPatchbayToStudio,
  getPatchbayWithPoints,
  importPatchbayForStudio,
  pickPatchbayFile
} from '../pdf/importPatchbay'

/** Runs a change to a studio's patchbay drawing, then tells every window, so a Patchbay Mode
 *  canvas already showing that studio (either pane of Split View) redraws. */
async function changing<T>(change: () => Promise<T>): Promise<T> {
  const result = await change()
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(PATCHBAY_CHANGED_CHANNEL)
  return result
}

export function registerPatchbayHandlers(): void {
  ipcMain.handle(IPC.patchbay.getForStudio, (_e, studioId: number) => getPatchbayWithPoints(studioId))
  ipcMain.handle(IPC.patchbay.importForStudio, (_e, studioId: number) =>
    changing(() => importPatchbayForStudio(studioId))
  )
  ipcMain.handle(IPC.patchbay.pickFile, () => pickPatchbayFile())
  ipcMain.handle(IPC.patchbay.commitPickedToStudio, (_e, studioId: number, sourcePath: string) =>
    changing(() => commitPickedPatchbayToStudio(studioId, sourcePath))
  )
  ipcMain.handle(IPC.patchbay.listCables, (_e, setupId: number) => listCablesBySetup(setupId))
  ipcMain.handle(IPC.patchbay.saveCables, (_e, setupId: number, cables: PatchbayCableDraft[]) =>
    replaceCablesForSetup(setupId, cables)
  )
}
