import { ipcMain } from 'electron'
import { IPC } from '@shared/types/ipc'
import * as roomLayoutFileRepo from '../db/repositories/roomLayoutFileRepo'
import { upsertBlankLayoutOverride } from '../db/repositories/setupLayoutOverrideRepo'
import { getEffectiveLayoutForSetup } from '../db/repositories/effectiveLayoutRepo'
import {
  importLayoutFileForStudio,
  pickLayoutFile,
  commitPickedLayoutFileToStudio,
  commitPickedLayoutFileToSetup
} from '../pdf/importLayoutFile'

export function registerLayoutFileHandlers(): void {
  ipcMain.handle(IPC.layoutFile.getForStudio, (_e, studioId: number) =>
    roomLayoutFileRepo.getLayoutFileForStudio(studioId)
  )
  ipcMain.handle(IPC.layoutFile.importForStudio, (_e, studioId: number) => importLayoutFileForStudio(studioId))
  ipcMain.handle(IPC.layoutFile.pickFile, () => pickLayoutFile())
  ipcMain.handle(IPC.layoutFile.commitPickedToStudio, (_e, studioId: number, sourcePath: string) =>
    commitPickedLayoutFileToStudio(studioId, sourcePath)
  )
  ipcMain.handle(IPC.layoutFile.commitPickedToSetup, (_e, setupId: number, sourcePath: string) =>
    commitPickedLayoutFileToSetup(setupId, sourcePath)
  )
  ipcMain.handle(IPC.layoutFile.setBlankForSetup, (_e, setupId: number) => upsertBlankLayoutOverride(setupId))
  ipcMain.handle(IPC.layoutFile.getEffectiveForSetup, (_e, setupId: number | null, studioId: number) =>
    getEffectiveLayoutForSetup(setupId, studioId)
  )
}
