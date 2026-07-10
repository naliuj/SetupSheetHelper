import { ipcMain } from 'electron'
import { IPC, type PaletteItemCreateInput, type PaletteItemUpdateInput } from '@shared/types/ipc'
import * as paletteRepo from '../db/repositories/paletteRepo'

export function registerPaletteHandlers(): void {
  ipcMain.handle(IPC.palette.listVisible, () => paletteRepo.listVisiblePaletteItems())
  ipcMain.handle(IPC.palette.listAll, () => paletteRepo.listAllPaletteItems())
  ipcMain.handle(IPC.palette.createCustom, (_e, input: PaletteItemCreateInput) =>
    paletteRepo.createCustomPaletteItem(input)
  )
  ipcMain.handle(IPC.palette.update, (_e, id: number, patch: PaletteItemUpdateInput) =>
    paletteRepo.updatePaletteItem(id, patch)
  )
  ipcMain.handle(IPC.palette.removeCustom, (_e, id: number) => paletteRepo.removeCustomPaletteItem(id))
  ipcMain.handle(IPC.palette.reorder, (_e, ids: number[]) => paletteRepo.reorderPaletteItems(ids))
}
