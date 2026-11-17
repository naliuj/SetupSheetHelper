import { ipcMain } from 'electron'
import { IPC, type ExportedStudio, type SaveStudioInventoryInput } from '@shared/types/ipc'
import * as buildingsRepo from '../db/repositories/buildingsRepo'
import * as studiosRepo from '../db/repositories/studiosRepo'
import { exportStudiosToFile, importStudios, pickAndParseImportFile } from '../studios/exportImport'

export function registerStudioHandlers(): void {
  ipcMain.handle(IPC.buildings.list, () => buildingsRepo.listBuildings())

  ipcMain.handle(IPC.studios.listByBuilding, (_e, buildingId: number) =>
    studiosRepo.listStudiosByBuilding(buildingId)
  )
  ipcMain.handle(IPC.studios.listCustom, () => studiosRepo.listCustomStudios())
  ipcMain.handle(IPC.studios.get, (_e, id: number) => studiosRepo.getStudio(id))
  ipcMain.handle(IPC.studios.createCustom, (_e, name: string, folderId: number | null) =>
    studiosRepo.createCustomStudio(name, folderId)
  )
  ipcMain.handle(IPC.studios.createTemporary, () => studiosRepo.createTemporaryStudio())
  ipcMain.handle(IPC.studios.saveInventory, (_e, input: SaveStudioInventoryInput) =>
    studiosRepo.saveStudioInventory(input)
  )
  ipcMain.handle(IPC.studios.remove, (_e, id: number) => studiosRepo.removeStudioCascade(id))
  ipcMain.handle(IPC.studios.removeMany, (_e, ids: number[]) => studiosRepo.removeStudiosCascade(ids))
  ipcMain.handle(IPC.studios.exportToFile, (_e, studioIds: number[]) => exportStudiosToFile(studioIds))
  ipcMain.handle(IPC.studios.pickImportFile, () => pickAndParseImportFile())
  ipcMain.handle(IPC.studios.importStudios, (_e, studios: ExportedStudio[]) => importStudios(studios))
  ipcMain.handle(IPC.studios.moveToFolder, (_e, id: number, folderId: number | null) =>
    studiosRepo.moveStudioToFolder(id, folderId)
  )
  ipcMain.handle(IPC.studios.moveManyToFolder, (_e, ids: number[], folderId: number | null) =>
    studiosRepo.moveStudiosToFolder(ids, folderId)
  )
  ipcMain.handle(IPC.studios.reorder, (_e, ids: number[]) => studiosRepo.reorderStudios(ids))
  ipcMain.handle(IPC.studios.getDeleteImpact, (_e, id: number) => studiosRepo.getStudioDeleteImpact(id))
}
