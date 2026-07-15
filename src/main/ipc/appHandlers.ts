import { app, ipcMain } from 'electron'
import { IPC } from '@shared/types/ipc'

export function registerAppHandlers(): void {
  ipcMain.handle(IPC.app.getVersion, () => app.getVersion())
}
