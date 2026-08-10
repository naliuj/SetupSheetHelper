import { dialog } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type {
  ExportedRoomLayoutFile,
  ExportedSetup,
  ExportedSetupItem,
  ExportSetupsResult,
  PickSetupImportFileResult,
  SetupExportFile,
  SetupItemInput
} from '@shared/types/ipc'
import { getLayoutsDir } from '../userDataPaths'
import {
  getSetupWithItems,
  createSetup,
  setOutboardColumnCount,
  setVisibleColumns,
  setColumnOrder
} from '../db/repositories/setupsRepo'
import { replaceItemsForSetup } from '../db/repositories/setupItemsRepo'
import { getSetupLayoutOverride, upsertFileLayoutOverride } from '../db/repositories/setupLayoutOverrideRepo'
import { getMicsByIds, listAvailableForStudio as listAvailableMics } from '../db/repositories/micsRepo'
import { getOutboardByIds, listAvailableForStudio as listAvailableOutboard } from '../db/repositories/outboardRepo'
import { getPreampsByIds, listAvailableForStudio as listAvailablePreamps } from '../db/repositories/preampRepo'

const EXPORT_VERSION = 1

function exportLayoutOverride(setupId: number): ExportedRoomLayoutFile | null {
  const override = getSetupLayoutOverride(setupId)
  if (!override || override.kind !== 'file' || !override.filePath || !existsSync(override.filePath)) return null
  try {
    return {
      originalName: override.originalName,
      extension: extname(override.filePath).toLowerCase(),
      pageWidthPt: override.pageWidthPt,
      pageHeightPt: override.pageHeightPt,
      dataBase64: readFileSync(override.filePath).toString('base64')
    }
  } catch {
    return null
  }
}

export async function exportSetupsToFile(setupIds: number[]): Promise<ExportSetupsResult> {
  const setups: ExportedSetup[] = setupIds.flatMap((id) => {
    const setup = getSetupWithItems(id)
    if (!setup) return []

    const micById = getMicsByIds(setup.items.flatMap((item) => (item.micId != null ? [item.micId] : [])))
    const preampById = getPreampsByIds(setup.items.flatMap((item) => (item.preampId != null ? [item.preampId] : [])))
    const outboardById = getOutboardByIds(
      setup.items.flatMap((item) => item.outboards.flatMap((slot) => (slot.outboardId != null ? [slot.outboardId] : [])))
    )

    const items: ExportedSetupItem[] = setup.items.map((item) => {
      const mic = item.micId != null ? micById.get(item.micId) ?? null : null
      const preamp = item.preampId != null ? preampById.get(item.preampId) ?? null : null
      return {
        instrumentType: item.instrumentType,
        sourceName: item.sourceName,
        micName: mic ? mic.name : item.micText,
        micManufacturer: mic ? mic.manufacturer : null,
        phantomPower: item.phantomPower,
        channel: item.channel,
        tieLine: item.tieLine,
        cueBox: item.cueBox,
        outboards: item.outboards.map((slot) => {
          const outboard = slot.outboardId != null ? outboardById.get(slot.outboardId) ?? null : null
          return {
            slotIndex: slot.slotIndex,
            outboardName: outboard ? outboard.name : slot.outboardText,
            outboardManufacturer: outboard ? outboard.manufacturer : null
          }
        }),
        preampName: preamp ? preamp.name : item.preampText,
        preampManufacturer: preamp ? preamp.manufacturer : null,
        polarityFlip: item.polarityFlip,
        notes: item.notes,
        color: item.color,
        groupId: item.groupId
      }
    })

    return [
      {
        name: setup.name,
        sessionDate: setup.sessionDate,
        engineer: setup.engineer,
        artist: setup.artist,
        facultyReserveEnabled: setup.facultyReserveEnabled,
        outboardColumnCount: setup.outboardColumnCount,
        visibleColumns: setup.visibleColumns,
        columnOrder: setup.columnOrder,
        sessionNotes: setup.sessionNotes,
        items,
        layoutOverride: exportLayoutOverride(id)
      }
    ]
  })

  const file: SetupExportFile = { version: EXPORT_VERSION, setups }

  const saveResult = await dialog.showSaveDialog({
    title: 'Export Setups',
    defaultPath: 'setups-export.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (saveResult.canceled || !saveResult.filePath) return { canceled: true }

  writeFileSync(saveResult.filePath, JSON.stringify(file, null, 2))
  return { canceled: false, filePath: saveResult.filePath }
}

export async function pickAndParseSetupImportFile(): Promise<PickSetupImportFileResult> {
  const openResult = await dialog.showOpenDialog({
    title: 'Import Setups',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (openResult.canceled || openResult.filePaths.length === 0) return { canceled: true }

  try {
    const raw = readFileSync(openResult.filePaths[0], 'utf-8')
    const parsed = JSON.parse(raw) as Partial<SetupExportFile>
    if (typeof parsed.version !== 'number' || !Array.isArray(parsed.setups)) {
      return { canceled: false, error: 'This file is not a valid setups export.' }
    }
    return { canceled: false, data: parsed as SetupExportFile }
  } catch {
    return { canceled: false, error: 'Could not read or parse that file.' }
  }
}

/** Case-insensitive, trimmed name+manufacturer match against the target studio's available
 *  gear — same rule as the Channel Preset resolver (channelPresetResolution.ts). Read-only:
 *  never creates gear, so unmatched references are left as plain text rather than risking
 *  duplicate-looking catalog entries from a bad guess. */
function findMatch<T extends { id: number; name: string; manufacturer: string | null }>(
  items: T[],
  name: string | null,
  manufacturer: string | null
): T | null {
  if (!name) return null
  const normalizedName = name.trim().toLowerCase()
  const normalizedManufacturer = (manufacturer ?? '').trim().toLowerCase()
  return (
    items.find(
      (item) =>
        item.name.trim().toLowerCase() === normalizedName &&
        (item.manufacturer ?? '').trim().toLowerCase() === normalizedManufacturer
    ) ?? null
  )
}

/** Imported setups always land in the target studio's root (no folder) — folders are local to
 *  the installation they were created in, same reasoning as studio import. */
export function importSetups(setups: ExportedSetup[], targetStudioId: number): void {
  for (const setup of setups) {
    const created = createSetup(
      targetStudioId,
      setup.name,
      setup.sessionDate,
      'setup',
      null,
      null,
      setup.engineer,
      setup.artist,
      setup.facultyReserveEnabled,
      setup.sessionNotes
    )
    setOutboardColumnCount(created.id, setup.outboardColumnCount)
    setVisibleColumns(created.id, setup.visibleColumns)
    if (setup.columnOrder) setColumnOrder(created.id, setup.columnOrder)

    const mics = listAvailableMics(targetStudioId, created.id, setup.facultyReserveEnabled)
    const outboardGear = listAvailableOutboard(targetStudioId, created.id, setup.facultyReserveEnabled)
    const preamps = listAvailablePreamps(targetStudioId, created.id, setup.facultyReserveEnabled)

    const items: SetupItemInput[] = setup.items.map((item, index) => {
      const mic = findMatch(mics, item.micName, item.micManufacturer)
      const preamp = findMatch(preamps, item.preampName, item.preampManufacturer)
      return {
        id: `import-${index}`,
        instrumentType: item.instrumentType,
        sourceName: item.sourceName,
        micId: mic?.id ?? null,
        micText: mic ? null : item.micName,
        phantomPower: item.phantomPower,
        channel: item.channel,
        tieLine: item.tieLine,
        cueBox: item.cueBox,
        outboards: item.outboards.map((slot) => {
          const outboard = findMatch(outboardGear, slot.outboardName, slot.outboardManufacturer)
          return {
            slotIndex: slot.slotIndex,
            outboardId: outboard?.id ?? null,
            outboardText: outboard ? null : slot.outboardName
          }
        }),
        preampId: preamp?.id ?? null,
        preampText: preamp ? null : item.preampName,
        polarityFlip: item.polarityFlip,
        notes: item.notes,
        color: item.color,
        groupId: item.groupId
      }
    })
    replaceItemsForSetup(created.id, items)

    if (setup.layoutOverride) {
      const destPath = join(getLayoutsDir(), `setup_${created.id}${setup.layoutOverride.extension}`)
      writeFileSync(destPath, Buffer.from(setup.layoutOverride.dataBase64, 'base64'))
      upsertFileLayoutOverride({
        setupId: created.id,
        filePath: destPath,
        originalName: setup.layoutOverride.originalName,
        pageWidthPt: setup.layoutOverride.pageWidthPt,
        pageHeightPt: setup.layoutOverride.pageHeightPt
      })
    }
  }
}
