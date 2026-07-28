import { ipcMain } from 'electron'
import { IPC, type AlignMultiSetupRowInput, type CreateMultiSetupInput } from '@shared/types/ipc'
import * as multiSetupsRepo from '../db/repositories/multiSetupsRepo'

export function registerMultiSetupHandlers(): void {
  ipcMain.handle(IPC.multiSetups.listAll, () => multiSetupsRepo.listAllMultiSetups())
  ipcMain.handle(IPC.multiSetups.getForSetup, (_e, setupId: number) => multiSetupsRepo.getMultiSetupForSetup(setupId))
  ipcMain.handle(IPC.multiSetups.listMembers, (_e, multiSetupId: number) =>
    multiSetupsRepo.listMultiSetupMembers(multiSetupId)
  )
  ipcMain.handle(IPC.multiSetups.createWithSetups, (_e, input: CreateMultiSetupInput) =>
    multiSetupsRepo.createMultiSetupWithSetups(input)
  )
  ipcMain.handle(IPC.multiSetups.addExisting, (_e, multiSetupId: number, setupId: number) =>
    multiSetupsRepo.addSetupToMultiSetup(multiSetupId, setupId)
  )
  ipcMain.handle(
    IPC.multiSetups.createAndAdd,
    (_e, multiSetupId: number, name: string, inheritFromSetupId: number) =>
      multiSetupsRepo.createSetupInMultiSetup(multiSetupId, name, inheritFromSetupId)
  )
  ipcMain.handle(IPC.multiSetups.removeSetup, (_e, setupId: number) =>
    multiSetupsRepo.removeSetupFromMultiSetup(setupId)
  )
  ipcMain.handle(IPC.multiSetups.rename, (_e, id: number, name: string) => multiSetupsRepo.renameMultiSetup(id, name))
  ipcMain.handle(IPC.multiSetups.recordLastOpened, (_e, setupId: number) =>
    multiSetupsRepo.recordLastOpenedSetup(setupId)
  )
  ipcMain.handle(IPC.multiSetups.getDeleteImpact, (_e, id: number) => multiSetupsRepo.getMultiSetupDeleteImpact(id))
  ipcMain.handle(IPC.multiSetups.moveToFolder, (_e, multiSetupId: number, folderId: number | null) =>
    multiSetupsRepo.moveMultiSetupToFolder(multiSetupId, folderId)
  )
  ipcMain.handle(IPC.multiSetups.removeManyCascade, (_e, ids: number[]) =>
    multiSetupsRepo.removeMultiSetupsCascade(ids)
  )
  ipcMain.handle(IPC.multiSetups.getComparison, (_e, multiSetupId: number) =>
    multiSetupsRepo.getMultiSetupComparison(multiSetupId)
  )
  ipcMain.handle(IPC.multiSetups.linkSources, (_e, multiSetupId: number, sourceNames: string[]) =>
    multiSetupsRepo.linkSources(multiSetupId, sourceNames)
  )
  ipcMain.handle(IPC.multiSetups.unlinkSource, (_e, multiSetupId: number, sourceName: string) =>
    multiSetupsRepo.unlinkSource(multiSetupId, sourceName)
  )
  ipcMain.handle(IPC.multiSetups.alignRow, (_e, input: AlignMultiSetupRowInput) =>
    multiSetupsRepo.alignMultiSetupRow(input)
  )
}
