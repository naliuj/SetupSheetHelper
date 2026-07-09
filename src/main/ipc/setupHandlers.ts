import { ipcMain } from 'electron'
import { IPC, type SaveAsTemplateInput, type SetupItemInput, type SetupsListFilter } from '@shared/types/ipc'
import * as setupsRepo from '../db/repositories/setupsRepo'
import * as setupItemsRepo from '../db/repositories/setupItemsRepo'

export function registerSetupHandlers(): void {
  ipcMain.handle(IPC.setups.list, (_e, studioId?: number) => setupsRepo.listSetups(studioId))
  ipcMain.handle(IPC.setups.listByKind, (_e, filter: SetupsListFilter) => setupsRepo.listSetupsByKind(filter))
  ipcMain.handle(IPC.setups.getWithItems, (_e, id: number) => setupsRepo.getSetupWithItems(id))
  ipcMain.handle(
    IPC.setups.create,
    (
      _e,
      studioId: number,
      name: string,
      sessionDate: string | null,
      folderId: number | null,
      engineer: string | null,
      artist: string | null,
      facultyReserveEnabled: boolean
    ) =>
      setupsRepo.createSetup(
        studioId,
        name,
        sessionDate,
        'setup',
        null,
        folderId,
        engineer,
        artist,
        facultyReserveEnabled
      )
  )
  ipcMain.handle(
    IPC.setups.rename,
    (
      _e,
      id: number,
      name: string,
      sessionDate: string | null,
      engineer: string | null,
      artist: string | null,
      facultyReserveEnabled: boolean
    ) => setupsRepo.renameSetup(id, name, sessionDate, engineer, artist, facultyReserveEnabled)
  )
  ipcMain.handle(IPC.setups.saveItems, (_e, setupId: number, items: SetupItemInput[]) => {
    const saved = setupItemsRepo.replaceItemsForSetup(setupId, items)
    setupsRepo.touchSetup(setupId)
    return saved
  })
  ipcMain.handle(IPC.setups.remove, (_e, id: number) => setupsRepo.removeSetup(id))
  ipcMain.handle(IPC.setups.instantiateFromTemplate, (_e, templateId: number) =>
    setupsRepo.instantiateFromTemplate(templateId)
  )
  ipcMain.handle(IPC.setups.saveAsTemplate, (_e, input: SaveAsTemplateInput) =>
    setupsRepo.saveAsTemplate(input.setupId, input.name, input.folderId)
  )
  ipcMain.handle(IPC.setups.moveToFolder, (_e, id: number, folderId: number | null) =>
    setupsRepo.moveSetupToFolder(id, folderId)
  )
  ipcMain.handle(IPC.setups.reorder, (_e, ids: number[]) => setupsRepo.reorderSetups(ids))
}
