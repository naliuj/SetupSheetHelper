import { ipcMain } from 'electron'
import { IPC } from '@shared/types/ipc'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { getDb } from '../db'
import { seedBerkleeData } from '../db/seedBerklee'
import * as settingsRepo from '../db/repositories/settingsRepo'

export function registerBerkleeHandlers(): void {
  ipcMain.handle(IPC.berklee.enable, () => {
    seedBerkleeData(getDb())
    settingsRepo.setSetting(APP_SETTINGS_KEYS.berkleeFeaturesEnabled, 'true')
  })
  ipcMain.handle(IPC.berklee.disable, () => {
    settingsRepo.setSetting(APP_SETTINGS_KEYS.berkleeFeaturesEnabled, 'false')
  })
}
