import { ipcMain } from 'electron'
import { IPC } from '@shared/types/ipc'
import * as presetFoldersRepo from '../db/repositories/presetFoldersRepo'

export function registerPresetFolderHandlers(): void {
  ipcMain.handle(IPC.presetFolders.list, () => presetFoldersRepo.listPresetFolders())
  ipcMain.handle(IPC.presetFolders.create, (_e, name: string, parentFolderId: number | null) =>
    presetFoldersRepo.createPresetFolder(name, parentFolderId)
  )
  ipcMain.handle(IPC.presetFolders.rename, (_e, id: number, name: string) =>
    presetFoldersRepo.renamePresetFolder(id, name)
  )
  ipcMain.handle(IPC.presetFolders.getDeleteImpact, (_e, id: number) =>
    presetFoldersRepo.getPresetFolderDeleteImpact(id)
  )
  ipcMain.handle(IPC.presetFolders.deleteRecursive, (_e, id: number) =>
    presetFoldersRepo.deletePresetFolderRecursive(id)
  )
  ipcMain.handle(IPC.presetFolders.deletePromoteContents, (_e, id: number) =>
    presetFoldersRepo.deletePresetFolderPromoteContents(id)
  )
}
