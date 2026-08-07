import { ipcMain } from 'electron'
import { IPC, type ExportSetupPdfInput, type ExportSetupSpreadsheetInput } from '@shared/types/ipc'
import { exportSetupPdf } from '../pdf/exportSetupPdf'
import { exportSetupSpreadsheet } from '../spreadsheet/exportSetupSpreadsheet'

export function registerExportHandlers(): void {
  ipcMain.handle(IPC.exportPdf.exportSetup, (_e, input: ExportSetupPdfInput) => exportSetupPdf(input))
  ipcMain.handle(IPC.exportSpreadsheet.exportSetup, (_e, input: ExportSetupSpreadsheetInput) =>
    exportSetupSpreadsheet(input)
  )
}
