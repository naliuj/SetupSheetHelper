import { ipcMain } from 'electron'
import {
  IPC,
  type DuplicateSetupInput,
  type ExportedSetup,
  type SaveAsTemplateInput,
  type SetupItemInput,
  type SetupsListFilter
} from '@shared/types/ipc'
import type { SetupColumnKey } from '@shared/constants/setupColumns'
import type { EditorMode } from '@shared/types/setup'
import * as setupsRepo from '../db/repositories/setupsRepo'
import * as setupItemsRepo from '../db/repositories/setupItemsRepo'
import { exportSetupsToFile, importSetups, pickAndParseSetupImportFile } from '../setups/exportImport'

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
      facultyReserveEnabled: boolean,
      sessionNotes?: string | null
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
        facultyReserveEnabled,
        sessionNotes
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
      facultyReserveEnabled: boolean,
      sessionNotes: string | null
    ) => setupsRepo.renameSetup(id, name, sessionDate, engineer, artist, facultyReserveEnabled, sessionNotes)
  )
  ipcMain.handle(IPC.setups.saveItems, (_e, setupId: number, items: SetupItemInput[]) => {
    const saved = setupItemsRepo.replaceItemsForSetup(setupId, items)
    setupsRepo.touchSetup(setupId)
    return saved
  })
  ipcMain.handle(IPC.setups.setOutboardColumnCount, (_e, setupId: number, count: number) =>
    setupsRepo.setOutboardColumnCount(setupId, count)
  )
  ipcMain.handle(IPC.setups.setVisibleColumns, (_e, setupId: number, columns: SetupColumnKey[]) =>
    setupsRepo.setVisibleColumns(setupId, columns)
  )
  ipcMain.handle(IPC.setups.setLastEditorMode, (_e, id: number, mode: EditorMode) =>
    setupsRepo.setLastEditorMode(id, mode)
  )
  ipcMain.handle(IPC.setups.remove, (_e, id: number) => setupsRepo.removeSetup(id))
  ipcMain.handle(IPC.setups.removeMany, (_e, ids: number[]) => setupsRepo.removeSetups(ids))
  ipcMain.handle(IPC.setups.exportToFile, (_e, setupIds: number[]) => exportSetupsToFile(setupIds))
  ipcMain.handle(IPC.setups.pickImportFile, () => pickAndParseSetupImportFile())
  ipcMain.handle(IPC.setups.importSetups, (_e, setups: ExportedSetup[], targetStudioId: number) =>
    importSetups(setups, targetStudioId)
  )
  ipcMain.handle(IPC.setups.instantiateFromTemplate, (_e, templateId: number) =>
    setupsRepo.instantiateFromTemplate(templateId)
  )
  ipcMain.handle(IPC.setups.saveAsTemplate, (_e, input: SaveAsTemplateInput) =>
    setupsRepo.saveAsTemplate(input.setupId, input.name, input.folderId)
  )
  ipcMain.handle(IPC.setups.duplicate, (_e, input: DuplicateSetupInput) =>
    setupsRepo.duplicateSetup(
      input.sourceSetupId,
      input.name,
      input.sessionDate,
      input.folderId,
      input.engineer,
      input.artist,
      input.facultyReserveEnabled
    )
  )
  ipcMain.handle(IPC.setups.moveToFolder, (_e, id: number, folderId: number | null) =>
    setupsRepo.moveSetupToFolder(id, folderId)
  )
  ipcMain.handle(IPC.setups.moveManyToFolder, (_e, ids: number[], folderId: number | null) =>
    setupsRepo.moveSetupsToFolder(ids, folderId)
  )
  ipcMain.handle(IPC.setups.reorder, (_e, ids: number[]) => setupsRepo.reorderSetups(ids))
}
