import { ipcMain } from 'electron'
import { IPC, type ExportedStudio } from '@shared/types/ipc'
import * as buildingsRepo from '../db/repositories/buildingsRepo'
import * as studiosRepo from '../db/repositories/studiosRepo'
import { exportStudiosToFile, importStudios, pickAndParseImportFile } from '../studios/exportImport'

export function registerStudioHandlers(): void {
  ipcMain.handle(IPC.buildings.list, () => buildingsRepo.listBuildings())
  ipcMain.handle(IPC.buildings.create, (_e, name: string) => buildingsRepo.createBuilding(name))
  ipcMain.handle(IPC.buildings.rename, (_e, id: number, name: string) => buildingsRepo.renameBuilding(id, name))
  ipcMain.handle(IPC.buildings.remove, (_e, id: number) => buildingsRepo.removeBuilding(id))

  ipcMain.handle(IPC.studios.listByBuilding, (_e, buildingId: number) =>
    studiosRepo.listStudiosByBuilding(buildingId)
  )
  ipcMain.handle(IPC.studios.listCustom, () => studiosRepo.listCustomStudios())
  ipcMain.handle(IPC.studios.get, (_e, id: number) => studiosRepo.getStudio(id))
  ipcMain.handle(IPC.studios.create, (_e, buildingId: number, name: string) =>
    studiosRepo.createStudio(buildingId, name)
  )
  ipcMain.handle(IPC.studios.createCustom, (_e, name: string, folderId: number | null) =>
    studiosRepo.createCustomStudio(name, folderId)
  )
  ipcMain.handle(IPC.studios.createTemporary, () => studiosRepo.createTemporaryStudio())
  ipcMain.handle(IPC.studios.updateCustomDetails, (_e, id: number, name: string, folderId: number | null) =>
    studiosRepo.updateCustomStudio(id, name, folderId)
  )
  ipcMain.handle(IPC.studios.rename, (_e, id: number, name: string) => studiosRepo.renameStudio(id, name))
  ipcMain.handle(IPC.studios.remove, (_e, id: number) => studiosRepo.removeStudioCascade(id))
  ipcMain.handle(IPC.studios.removeMany, (_e, ids: number[]) => studiosRepo.removeStudiosCascade(ids))
  ipcMain.handle(IPC.studios.exportToFile, (_e, studioIds: number[]) => exportStudiosToFile(studioIds))
  ipcMain.handle(IPC.studios.pickImportFile, () => pickAndParseImportFile())
  ipcMain.handle(IPC.studios.importStudios, (_e, studios: ExportedStudio[]) => importStudios(studios))
  ipcMain.handle(IPC.studios.moveToFolder, (_e, id: number, folderId: number | null) =>
    studiosRepo.moveStudioToFolder(id, folderId)
  )
  ipcMain.handle(IPC.studios.reorder, (_e, ids: number[]) => studiosRepo.reorderStudios(ids))
  ipcMain.handle(IPC.studios.getDeleteImpact, (_e, id: number) => studiosRepo.getStudioDeleteImpact(id))
}
