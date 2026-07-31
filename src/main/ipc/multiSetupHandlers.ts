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
  ipcMain.handle(IPC.multiSetups.createAndAdd, (_e, multiSetupId: number, name: string) =>
    multiSetupsRepo.createSetupInMultiSetup(multiSetupId, name)
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
  ipcMain.handle(IPC.multiSetups.renameItemSource, (_e, itemId: number, sourceName: string) =>
    multiSetupsRepo.renameComparisonItem(itemId, sourceName)
  )
  ipcMain.handle(
    IPC.multiSetups.setItemMic,
    (_e, itemId: number, micId: number | null, micText: string | null, notes: string | null) =>
      multiSetupsRepo.setComparisonItemMic(itemId, micId, micText, notes)
  )
  ipcMain.handle(IPC.multiSetups.linkItems, (_e, itemIds: number[], groupId: string) =>
    multiSetupsRepo.linkComparisonItems(itemIds, groupId)
  )
  ipcMain.handle(IPC.multiSetups.unlinkGroup, (_e, setupId: number, groupId: string) =>
    multiSetupsRepo.unlinkComparisonGroup(setupId, groupId)
  )
  ipcMain.handle(IPC.multiSetups.alignRow, (_e, input: AlignMultiSetupRowInput) =>
    multiSetupsRepo.alignMultiSetupRow(input)
  )
}
