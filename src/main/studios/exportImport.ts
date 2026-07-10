import { dialog } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import type {
  ExportedStudio,
  ExportStudiosResult,
  PickImportFileResult,
  StudioExportFile
} from '@shared/types/ipc'
import * as studiosRepo from '../db/repositories/studiosRepo'
import { listStudioMics, upsertMic } from '../db/repositories/micsRepo'
import { listOutboardByStudio, upsertOutboard } from '../db/repositories/outboardRepo'
import { listPreampsByStudio, upsertPreamp } from '../db/repositories/preampRepo'

const EXPORT_VERSION = 2

export async function exportStudiosToFile(studioIds: number[]): Promise<ExportStudiosResult> {
  const studios: ExportedStudio[] = studioIds.flatMap((id) => {
    const studio = studiosRepo.getStudio(id)
    if (!studio) return []
    return [
      {
        name: studio.name,
        hasConsole: studio.hasConsole,
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
        }))
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
    return { canceled: false, data: parsed as StudioExportFile }
  } catch {
    return { canceled: false, error: 'Could not read or parse that file.' }
  }
}

/** Imported studios always land as new, ungrouped Custom Studios — building IDs aren't portable
 *  across installations. hasConsole/preamps default safely for older (v1) export files that
 *  predate this feature — hasConsole true (matches the DB column's own default), preamps []. */
export function importStudios(studios: ExportedStudio[]): void {
  for (const studio of studios) {
    const created = studiosRepo.createCustomStudio(studio.name, null, studio.hasConsole ?? true)
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
  }
}
