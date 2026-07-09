import { ipcMain } from 'electron'
import { IPC, type MicUpsertInput, type OutboardUpsertInput, type PreampUpsertInput } from '@shared/types/ipc'
import * as micsRepo from '../db/repositories/micsRepo'
import * as outboardRepo from '../db/repositories/outboardRepo'
import * as preampRepo from '../db/repositories/preampRepo'
import * as settingsRepo from '../db/repositories/settingsRepo'

export function registerCatalogHandlers(): void {
  ipcMain.handle(
    IPC.mics.listAvailableForStudio,
    (_e, studioId: number, setupId?: number | null, facultyReserveEnabledForSetup?: boolean) =>
      micsRepo.listAvailableForStudio(studioId, setupId, facultyReserveEnabledForSetup)
  )
  ipcMain.handle(IPC.mics.listStudioMics, (_e, studioId: number) => micsRepo.listStudioMics(studioId))
  ipcMain.handle(IPC.mics.listBuildingPool, (_e, buildingId: number) => micsRepo.listBuildingPool(buildingId))
  ipcMain.handle(IPC.mics.listFacultyReserve, () => micsRepo.listFacultyReserve())
  ipcMain.handle(IPC.mics.listPersonalPool, () => micsRepo.listPersonalPool())
  ipcMain.handle(IPC.mics.listSetupGear, (_e, setupId: number) => micsRepo.listSetupGear(setupId))
  ipcMain.handle(IPC.mics.listAll, () => micsRepo.listAllMics())
  ipcMain.handle(IPC.mics.listAllWithStudio, () => micsRepo.listAllMicsWithStudio())
  ipcMain.handle(IPC.mics.upsert, (_e, input: MicUpsertInput) => micsRepo.upsertMic(input))
  ipcMain.handle(IPC.mics.remove, (_e, id: number) => micsRepo.removeMic(id))

  ipcMain.handle(IPC.outboard.listByStudio, (_e, studioId: number) => outboardRepo.listOutboardByStudio(studioId))
  ipcMain.handle(
    IPC.outboard.listAvailableForStudio,
    (_e, studioId: number, setupId?: number | null, facultyReserveEnabledForSetup?: boolean) =>
      outboardRepo.listAvailableForStudio(studioId, setupId, facultyReserveEnabledForSetup)
  )
  ipcMain.handle(IPC.outboard.listBuildingPool, (_e, buildingId: number) => outboardRepo.listBuildingPool(buildingId))
  ipcMain.handle(IPC.outboard.listFacultyReserve, () => outboardRepo.listFacultyReserve())
  ipcMain.handle(IPC.outboard.listPersonalOutboard, () => outboardRepo.listPersonalOutboard())
  ipcMain.handle(IPC.outboard.listSetupGear, (_e, setupId: number) => outboardRepo.listSetupGear(setupId))
  ipcMain.handle(IPC.outboard.listAll, () => outboardRepo.listAllOutboard())
  ipcMain.handle(IPC.outboard.listAllWithStudio, () => outboardRepo.listAllOutboardWithStudio())
  ipcMain.handle(IPC.outboard.upsert, (_e, input: OutboardUpsertInput) => outboardRepo.upsertOutboard(input))
  ipcMain.handle(IPC.outboard.remove, (_e, id: number) => outboardRepo.removeOutboard(id))

  ipcMain.handle(IPC.preamps.listByStudio, (_e, studioId: number) => preampRepo.listPreampsByStudio(studioId))
  ipcMain.handle(IPC.preamps.listAvailableForStudio, (_e, studioId: number, setupId?: number | null) =>
    preampRepo.listAvailableForStudio(studioId, setupId)
  )
  ipcMain.handle(IPC.preamps.listSetupGear, (_e, setupId: number) => preampRepo.listSetupGear(setupId))
  ipcMain.handle(IPC.preamps.listAll, () => preampRepo.listAllPreamps())
  ipcMain.handle(IPC.preamps.upsert, (_e, input: PreampUpsertInput) => preampRepo.upsertPreamp(input))
  ipcMain.handle(IPC.preamps.remove, (_e, id: number) => preampRepo.removePreamp(id))

  ipcMain.handle(IPC.settings.get, (_e, key: string) => settingsRepo.getSetting(key))
  ipcMain.handle(IPC.settings.set, (_e, key: string, value: string) => settingsRepo.setSetting(key, value))
}
