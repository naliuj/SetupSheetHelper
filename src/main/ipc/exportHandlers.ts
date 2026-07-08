import { ipcMain } from 'electron'
import { IPC, type ExportSetupPdfInput } from '@shared/types/ipc'
import { exportSetupPdf } from '../pdf/exportSetupPdf'

export function registerExportHandlers(): void {
  ipcMain.handle(IPC.exportPdf.exportSetup, (_e, input: ExportSetupPdfInput) => exportSetupPdf(input))
}
