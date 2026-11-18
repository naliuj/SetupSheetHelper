import { ipcMain } from 'electron'
import {
  IPC,
  type ExportChangeoverPdfInput,
  type ExportSetupPdfInput,
  type ExportSetupSpreadsheetInput
} from '@shared/types/ipc'
import { exportSetupPdf } from '../pdf/exportSetupPdf'
import { exportChangeoverPdf } from '../pdf/exportChangeoverPdf'
import { exportSetupSpreadsheet } from '../spreadsheet/exportSetupSpreadsheet'

export function registerExportHandlers(): void {
  ipcMain.handle(IPC.exportPdf.exportSetup, (_e, input: ExportSetupPdfInput) => exportSetupPdf(input))
  ipcMain.handle(IPC.exportPdf.exportChangeover, (_e, input: ExportChangeoverPdfInput) =>
    exportChangeoverPdf(input)
  )
  ipcMain.handle(IPC.exportSpreadsheet.exportSetup, (_e, input: ExportSetupSpreadsheetInput) =>
    exportSetupSpreadsheet(input)
  )
}
