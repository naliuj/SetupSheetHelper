import { dialog, ipcMain } from 'electron'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { IPC, type PickedSpreadsheet } from '@shared/types/ipc'

/** The file side of "Import from a spreadsheet…" on the studio setup page. Main only finds and
 *  reads the file; everything about what's in it lives in shared/utils/spreadsheetGear.ts, which
 *  the renderer runs so the user can see and correct each guess. */

/** Far past any real gear list, and small enough that a wrongly chosen file (a video, a disk
 *  image renamed .csv) is refused rather than read into memory. */
const MAX_BYTES = 5 * 1024 * 1024

/** Text from a spreadsheet export, whatever it was saved as. UTF-8 first — Mac Excel, Numbers and
 *  Google Sheets all write it — and only if the bytes aren't valid UTF-8, Windows-1252, which is
 *  what Excel on Windows still writes for plain "CSV (Comma delimited)". Reading that as UTF-8 is
 *  how "Brüel & Kjær" becomes "Br�el & Kj�r". */
function decode(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

async function pickSpreadsheet(): Promise<PickedSpreadsheet | null> {
  const result = await dialog.showOpenDialog({
    title: 'Import Gear from a Spreadsheet',
    properties: ['openFile'],
    filters: [{ name: 'Spreadsheet (CSV)', extensions: ['csv', 'tsv', 'txt'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const path = result.filePaths[0]
  if (statSync(path).size > MAX_BYTES) {
    return { fileName: basename(path), text: '', error: 'That file is too big to be a gear list (over 5 MB).' }
  }
  return { fileName: basename(path), text: decode(readFileSync(path)), error: null }
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
