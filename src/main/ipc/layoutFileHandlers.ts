import { ipcMain } from 'electron'
import { IPC } from '@shared/types/ipc'
import * as roomLayoutFileRepo from '../db/repositories/roomLayoutFileRepo'
import { importLayoutFileForStudio } from '../pdf/importLayoutFile'

export function registerLayoutFileHandlers(): void {
  ipcMain.handle(IPC.layoutFile.getForStudio, (_e, studioId: number) =>
    roomLayoutFileRepo.getLayoutFileForStudio(studioId)
  )
  ipcMain.handle(IPC.layoutFile.importForStudio, (_e, studioId: number) => importLayoutFileForStudio(studioId))
}
