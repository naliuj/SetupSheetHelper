import { ipcMain } from 'electron'
import { IPC, type ChannelPresetCreateInput } from '@shared/types/ipc'
import * as channelPresetsRepo from '../db/repositories/channelPresetsRepo'

export function registerChannelPresetHandlers(): void {
  ipcMain.handle(IPC.presets.list, () => channelPresetsRepo.listChannelPresets())
  ipcMain.handle(IPC.presets.getWithItems, (_e, id: number) => channelPresetsRepo.getChannelPresetWithItems(id))
  ipcMain.handle(IPC.presets.create, (_e, input: ChannelPresetCreateInput) =>
    channelPresetsRepo.createChannelPreset(input)
  )
  ipcMain.handle(IPC.presets.update, (_e, id: number, input: ChannelPresetCreateInput) =>
    channelPresetsRepo.updateChannelPreset(id, input)
  )
  ipcMain.handle(IPC.presets.remove, (_e, id: number) => channelPresetsRepo.removeChannelPreset(id))
}
