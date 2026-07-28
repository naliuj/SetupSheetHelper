import { ipcMain } from 'electron'
import { IPC } from '@shared/types/ipc'
import * as multiSetupsRepo from '../db/repositories/multiSetupsRepo'

export function registerMultiSetupHandlers(): void {
  ipcMain.handle(IPC.multiSetups.listAll, () => multiSetupsRepo.listAllMultiSetups())
  ipcMain.handle(IPC.multiSetups.getForSetup, (_e, setupId: number) => multiSetupsRepo.getMultiSetupForSetup(setupId))
  ipcMain.handle(IPC.multiSetups.listMembers, (_e, multiSetupId: number) =>
    multiSetupsRepo.listMultiSetupMembers(multiSetupId)
  )
  ipcMain.handle(IPC.multiSetups.createFromSetup, (_e, setupId: number, name: string) =>
    multiSetupsRepo.createMultiSetupFromSetup(setupId, name)
  )
  ipcMain.handle(IPC.multiSetups.addExisting, (_e, multiSetupId: number, setupId: number) =>
    multiSetupsRepo.addSetupToMultiSetup(multiSetupId, setupId)
  )
  ipcMain.handle(IPC.multiSetups.createAndAdd, (_e, multiSetupId: number, name: string) =>
    multiSetupsRepo.createSetupInMultiSetup(multiSetupId, name)
  )
  ipcMain.handle(IPC.multiSetups.removeSetup, (_e, setupId: number) =>
    multiSetupsRepo.removeSetupFromMultiSetup(setupId)
  )
  ipcMain.handle(IPC.multiSetups.rename, (_e, id: number, name: string) => multiSetupsRepo.renameMultiSetup(id, name))
}
