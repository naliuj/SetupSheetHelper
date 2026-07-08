import { ipcMain } from 'electron'
import { IPC, type RoomLayoutBlockInput } from '@shared/types/ipc'
import * as roomLayoutBlocksRepo from '../db/repositories/roomLayoutBlocksRepo'

export function registerRoomLayoutBlockHandlers(): void {
  ipcMain.handle(IPC.roomLayoutBlocks.listBySetup, (_e, setupId: number) =>
    roomLayoutBlocksRepo.listBlocksBySetup(setupId)
  )
  ipcMain.handle(IPC.roomLayoutBlocks.saveForSetup, (_e, setupId: number, blocks: RoomLayoutBlockInput[]) =>
    roomLayoutBlocksRepo.replaceBlocksForSetup(setupId, blocks)
  )
}
