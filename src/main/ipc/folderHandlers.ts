import { ipcMain } from 'electron'
import { IPC } from '@shared/types/ipc'
import * as foldersRepo from '../db/repositories/foldersRepo'

export function registerFolderHandlers(): void {
  ipcMain.handle(IPC.folders.list, () => foldersRepo.listFolders())
  ipcMain.handle(IPC.folders.create, (_e, name: string, parentFolderId: number | null) =>
    foldersRepo.createFolder(name, parentFolderId)
  )
  ipcMain.handle(IPC.folders.rename, (_e, id: number, name: string) => foldersRepo.renameFolder(id, name))
  ipcMain.handle(IPC.folders.getDeleteImpact, (_e, id: number) => foldersRepo.getFolderDeleteImpact(id))
  ipcMain.handle(IPC.folders.deleteRecursive, (_e, id: number) => foldersRepo.deleteFolderRecursive(id))
  ipcMain.handle(IPC.folders.deletePromoteContents, (_e, id: number) =>
    foldersRepo.deleteFolderPromoteContents(id)
  )
}
