import { dialog } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type {
  ExportedRoomLayoutFile,
  ExportedStudio,
  ExportStudiosResult,
  ImportStudiosResult,
  PickImportFileResult,
  StudioExportFile
} from '@shared/types/ipc'
import { getLayoutsDir } from '../userDataPaths'
import * as studiosRepo from '../db/repositories/studiosRepo'
import { listStudioMics, upsertMic } from '../db/repositories/micsRepo'
import { listOutboardByStudio, upsertOutboard } from '../db/repositories/outboardRepo'
import { listPreampsByStudio, upsertPreamp } from '../db/repositories/preampRepo'
import { getLayoutFileForStudio, upsertLayoutFile } from '../db/repositories/roomLayoutFileRepo'

const EXPORT_VERSION = 3

/** A pack names its own layout-file extension, and that string is interpolated into a path on
 *  import. Packs used to only ever come from a file the user picked; they can now be fetched from
 *  the web, so the value is untrusted input. Anything outside this list is dropped rather than
 *  written. */
const ALLOWED_LAYOUT_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg'])

function exportRoomLayoutFile(studioId: number): ExportedRoomLayoutFile | null {
  const layoutFile = getLayoutFileForStudio(studioId)
  if (!layoutFile || !existsSync(layoutFile.filePath)) return null
  try {
    const dataBase64 = readFileSync(layoutFile.filePath).toString('base64')
    return {
      originalName: layoutFile.originalName,
      extension: extname(layoutFile.filePath).toLowerCase(),
      pageWidthPt: layoutFile.pageWidthPt,
      pageHeightPt: layoutFile.pageHeightPt,
      dataBase64
    }
  } catch {
    return null
  }
}

export async function exportStudiosToFile(studioIds: number[]): Promise<ExportStudiosResult> {
  const studios: ExportedStudio[] = studioIds.flatMap((id) => {
    const studio = studiosRepo.getStudio(id)
    if (!studio) return []
    return [
      {
        name: studio.name,
        mics: listStudioMics(id).map((mic) => ({
          name: mic.name,
          manufacturer: mic.manufacturer,
          category: mic.category,
          quantity: mic.quantity
        })),
        outboardGear: listOutboardByStudio(id).map((gear) => ({
          name: gear.name,
          manufacturer: gear.manufacturer,
          category: gear.category,
          quantity: gear.quantity
        })),
        preamps: listPreampsByStudio(id).map((preamp) => ({
          name: preamp.name,
          manufacturer: preamp.manufacturer,
          category: preamp.category,
          channels: preamp.channels
        })),
        roomLayoutFile: exportRoomLayoutFile(id)
      }
    ]
  })

  const file: StudioExportFile = { version: EXPORT_VERSION, studios }

  const saveResult = await dialog.showSaveDialog({
    title: 'Export Studios',
    defaultPath: 'studios-export.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (saveResult.canceled || !saveResult.filePath) return { canceled: true }

  writeFileSync(saveResult.filePath, JSON.stringify(file, null, 2))
  return { canceled: false, filePath: saveResult.filePath }
}

export async function pickAndParseImportFile(): Promise<PickImportFileResult> {
  const openResult = await dialog.showOpenDialog({
    title: 'Import Studios',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (openResult.canceled || openResult.filePaths.length === 0) return { canceled: true }

  try {
    const raw = readFileSync(openResult.filePaths[0], 'utf-8')
    const parsed = JSON.parse(raw) as Partial<StudioExportFile>
    if (typeof parsed.version !== 'number' || !Array.isArray(parsed.studios)) {
      return { canceled: false, error: 'This file is not a valid studio export.' }
    }
    if (parsed.version > EXPORT_VERSION) {
      return {
        canceled: false,
        error: `This file was made by a newer version of Setup Sheet Helper (format ${parsed.version}). Update the app to import it.`
      }
    }
    return { canceled: false, data: parsed as StudioExportFile }
  } catch {
    return { canceled: false, error: 'Could not read or parse that file.' }
  }
}

/** Imported studios always land as new, ungrouped Custom Studios — building IDs aren't portable
 *  across installations. preamps/roomLayoutFile default safely (empty/null) for older export files
 *  that predate them. */
export function importStudios(studios: ExportedStudio[]): ImportStudiosResult {
  const imported: string[] = []
  for (const studio of studios) {
    const created = studiosRepo.createCustomStudio(studio.name, null)
    imported.push(created.name)
    for (const mic of studio.mics) {
      upsertMic({
        poolType: 'studio',
        studioId: created.id,
        buildingId: null,
        setupId: null,
        name: mic.name,
        manufacturer: mic.manufacturer,
        category: mic.category,
        notes: null,
        quantity: mic.quantity
      })
    }
    for (const gear of studio.outboardGear) {
      upsertOutboard({
        poolType: 'studio',
        studioId: created.id,
        buildingId: null,
        setupId: null,
        name: gear.name,
        manufacturer: gear.manufacturer,
        category: gear.category,
        notes: null,
        quantity: gear.quantity
      })
    }
    for (const preamp of studio.preamps ?? []) {
      upsertPreamp({
        poolType: 'studio',
        studioId: created.id,
        buildingId: null,
        setupId: null,
        name: preamp.name,
        manufacturer: preamp.manufacturer,
        category: preamp.category,
        notes: null,
        channels: preamp.channels
      })
    }
    const layoutFile =
      studio.roomLayoutFile && ALLOWED_LAYOUT_EXTENSIONS.has(studio.roomLayoutFile.extension.toLowerCase())
        ? studio.roomLayoutFile
        : null
    if (layoutFile) {
      const destPath = join(getLayoutsDir(), `studio_${created.id}${layoutFile.extension}`)
      writeFileSync(destPath, Buffer.from(layoutFile.dataBase64, 'base64'))
      upsertLayoutFile({
        studioId: created.id,
        filePath: destPath,
        originalName: layoutFile.originalName,
        pageWidthPt: layoutFile.pageWidthPt,
        pageHeightPt: layoutFile.pageHeightPt
      })
    }
  }
  return { imported }
}
