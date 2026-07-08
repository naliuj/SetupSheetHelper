import { ipcMain } from 'electron'
import { IPC } from '@shared/types/ipc'
import * as roomLayoutPdfRepo from '../db/repositories/roomLayoutPdfRepo'
import { importLayoutPdfForStudio } from '../pdf/importLayoutPdf'

export function registerPdfHandlers(): void {
  ipcMain.handle(IPC.layoutPdf.getForStudio, (_e, studioId: number) =>
    roomLayoutPdfRepo.getLayoutPdfForStudio(studioId)
  )
  ipcMain.handle(IPC.layoutPdf.importForStudio, (_e, studioId: number) => importLayoutPdfForStudio(studioId))
}
