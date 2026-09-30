import { dialog, ipcMain } from 'electron'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { IPC, type PickedSpreadsheet } from '@shared/types/ipc'
import { decodeSpreadsheet, MAX_IMPORT_BYTES, SPREADSHEET_EXTENSIONS } from '@shared/utils/spreadsheetGear'

/** The file side of "Import from a spreadsheet…" on the studio setup page. Main only finds and
 *  reads the file; everything about what's in it lives in shared/utils/spreadsheetGear.ts, which
 *  the renderer runs so the user can see and correct each guess. */

async function pickSpreadsheet(): Promise<PickedSpreadsheet | null> {
  const result = await dialog.showOpenDialog({
    title: 'Import Gear from a Spreadsheet',
    properties: ['openFile'],
    filters: [{ name: 'Spreadsheet (CSV)', extensions: [...SPREADSHEET_EXTENSIONS] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const path = result.filePaths[0]
  if (statSync(path).size > MAX_IMPORT_BYTES) {
    return { fileName: basename(path), text: '', error: 'That file is too big to be a gear list (over 5 MB).' }
  }
  return { fileName: basename(path), text: decodeSpreadsheet(readFileSync(path)), error: null }
}

/** The template offered for starting from scratch: the columns the importer recognizes without
 *  any matching, and one row of each kind to show what goes where. Preamps count channels. */
const TEMPLATE = [
  'Type,Manufacturer,Name,Category,Quantity',
  'Mic,Neumann,U 87 Ai,Condenser,2',
  'Mic,Shure,SM57,Dynamic,4',
  'Outboard,Universal Audio,1176LN,Compressor,2',
  'Preamp,Neve,1073,,8',
  ''
].join('\r\n')

async function saveTemplate(): Promise<boolean> {
  const result = await dialog.showSaveDialog({
    title: 'Save Gear Template',
    defaultPath: 'gear-template.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  if (result.canceled || !result.filePath) return false
  writeFileSync(result.filePath, TEMPLATE, 'utf8')
  return true
}

export function registerSpreadsheetImportHandlers(): void {
  ipcMain.handle(IPC.spreadsheetImport.pick, () => pickSpreadsheet())
  ipcMain.handle(IPC.spreadsheetImport.saveTemplate, () => saveTemplate())
}
