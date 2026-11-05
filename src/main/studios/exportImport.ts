import { dialog } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type {
  ExportedPatchbayFile,
  ExportedRoomLayoutFile,
  ExportedStudio,
  ExportStudiosResult,
  ImportStudiosResult,
  PickImportFileResult,
  StudioExportFile
} from '@shared/types/ipc'
import { LAYOUT_FILE_EXTENSIONS } from '@shared/constants/roomLayout'
import { getLayoutsDir, getPatchbaysDir } from '../userDataPaths'
import { getDb } from '../db/index'
import * as studiosRepo from '../db/repositories/studiosRepo'
import { listStudioMics, upsertMic } from '../db/repositories/micsRepo'
import { listOutboardByStudio, upsertOutboard } from '../db/repositories/outboardRepo'
import { listPreampsByStudio, upsertPreamp } from '../db/repositories/preampRepo'
import { getLayoutFileForStudio, upsertLayoutFile } from '../db/repositories/roomLayoutFileRepo'
import { getPatchbayFileForStudio, upsertPatchbayFile } from '../db/repositories/patchbayFileRepo'

/** The newest format this app reads and writes. v4 added patchbay drawings, but a file is only
 *  stamped 4 when one of its studios carries a drawing (see exportVersionFor): the rest of v4 is
 *  v3, so a pack without a patchbay stays importable by apps from before Patchbay Mode. */
const EXPORT_VERSION = 4
const EXPORT_VERSION_WITHOUT_PATCHBAY = 3

export function exportVersionFor(studios: ExportedStudio[]): number {
  return studios.some((studio) => studio.patchbayFile) ? EXPORT_VERSION : EXPORT_VERSION_WITHOUT_PATCHBAY
}

/** A pack or setup file names its own layout-file extension, and that string is interpolated into
 *  a path on import (join() normalizes, so '../../x' would escape the layouts folder). Packs can
 *  be fetched from the web, so the value is untrusted input. Exactly the types the upload dialog
 *  accepts; anything else is dropped rather than written. */
const ALLOWED_LAYOUT_EXTENSIONS = new Set(LAYOUT_FILE_EXTENSIONS.map((ext) => `.${ext}`))

/** Whether the payload really is the format its extension claims, by its leading bytes. */
function matchesLayoutFormat(extension: string, data: Buffer): boolean {
  const head = data.subarray(0, 16).toString('latin1')
  switch (extension) {
    case '.pdf':
      return head.startsWith('%PDF-')
    case '.png':
      return head.startsWith('\x89PNG')
    case '.jpg':
    case '.jpeg':
      return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
    case '.gif':
      return head.startsWith('GIF8')
    case '.webp':
      return head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP'
    case '.bmp':
      return head.startsWith('BM')
    case '.svg':
      // Text, so there is no magic number: an XML declaration, a comment or <svg> itself, after an
      // optional byte-order mark and leading whitespace.
      return /^(\uFEFF)?\s*</.test(data.subarray(0, 1024).toString('utf8'))
    default:
      return false
  }
}

function positiveOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** A shared file's layout, decoded, or null when it isn't one worth writing. Studio packs and setup
 *  files both carry one and both can come from someone else, so the same checks as
 *  decodePatchbayFile: a known extension (lowercased, so the file lands as setup_7.pdf and a later
 *  upload of setup_7.pdf overwrites rather than deletes it on a case-insensitive disk), and a
 *  payload that is actually that format. Page sizes only describe a PDF; a bad one becomes null
 *  and Layout Mode measures the file itself. */
export function decodeLayoutFile(
  raw: unknown
): (Omit<ExportedRoomLayoutFile, 'dataBase64'> & { data: Buffer }) | null {
  if (typeof raw !== 'object' || raw === null) return null
  const file = raw as Record<string, unknown>
  if (typeof file.extension !== 'string' || typeof file.dataBase64 !== 'string') return null
  const extension = file.extension.toLowerCase()
  if (!ALLOWED_LAYOUT_EXTENSIONS.has(extension)) return null
  const data = Buffer.from(file.dataBase64, 'base64')
  if (!matchesLayoutFormat(extension, data)) return null
  return {
    data,
    extension,
    originalName: typeof file.originalName === 'string' ? file.originalName : null,
    pageWidthPt: positiveOrNull(file.pageWidthPt),
    pageHeightPt: positiveOrNull(file.pageHeightPt)
  }
}

/** Gear counts from a shared file. A missing, fractional or negative count would otherwise land in
 *  the catalog as-is and show as "0x" or "NaN" stock. */
function positiveCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1
}

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

function exportPatchbayFile(studioId: number): ExportedPatchbayFile | null {
  const patchbayFile = getPatchbayFileForStudio(studioId)
  if (!patchbayFile || !existsSync(patchbayFile.filePath)) return null
  try {
    return {
      originalName: patchbayFile.originalName,
      pageWidthPt: patchbayFile.pageWidthPt,
      pageHeightPt: patchbayFile.pageHeightPt,
      dataBase64: readFileSync(patchbayFile.filePath).toString('base64')
    }
  } catch {
    return null
  }
}

/** A pack's drawing, decoded, or null when it isn't one worth writing. Packs can come from the web,
 *  so the payload is untrusted: it has to actually be a PDF, and its page size has to be a real one,
 *  since Patchbay Mode sizes the whole canvas from it. Jacks aren't read here; Patchbay Mode
 *  detects them the first time the studio is opened, as it does for the bundled drawings. */
function decodePatchbayFile(
  raw: unknown
): { data: Buffer; originalName: string | null; pageWidthPt: number; pageHeightPt: number } | null {
  if (typeof raw !== 'object' || raw === null) return null
  const file = raw as Record<string, unknown>
  const { pageWidthPt, pageHeightPt, dataBase64 } = file
  if (typeof pageWidthPt !== 'number' || !Number.isFinite(pageWidthPt) || pageWidthPt <= 0) return null
  if (typeof pageHeightPt !== 'number' || !Number.isFinite(pageHeightPt) || pageHeightPt <= 0) return null
  if (typeof dataBase64 !== 'string') return null
  const data = Buffer.from(dataBase64, 'base64')
  if (data.subarray(0, 5).toString('latin1') !== '%PDF-') return null
  return {
    data,
    originalName: typeof file.originalName === 'string' ? file.originalName : null,
    pageWidthPt,
    pageHeightPt
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
        roomLayoutFile: exportRoomLayoutFile(id),
        patchbayFile: exportPatchbayFile(id)
      }
    ]
  })

  const file: StudioExportFile = { version: exportVersionFor(studios), studios }

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
 *  across installations. preamps/roomLayoutFile/patchbayFile default safely (empty/null) for older
 *  export files that predate them. */
export function importStudios(studios: ExportedStudio[]): ImportStudiosResult {
  const db = getDb()
  // All-or-nothing. Each studio is a create plus N gear upserts plus a layout-file write, and
  // none of it was wrapped: a duplicate name or a bad base64 payload partway through left the
  // studio row created, some of its gear inserted, the rest missing, and every later studio in
  // the file unimported — while the renderer told the user "Nothing was changed."
  //
  // The layout and patchbay FILE writes are not transactional; nothing rolls back a filesystem
  // write. That is harmless here: after a rollback no row references either file, and the next
  // import overwrites them, since their names are derived from the studio id.
  const run = db.transaction(() => {
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
          quantity: positiveCount(mic.quantity)
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
          quantity: positiveCount(gear.quantity)
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
          channels: positiveCount(preamp.channels)
        })
      }
      // Dropped rather than written when it isn't a layout we recognize — see decodeLayoutFile.
      const layoutFile = decodeLayoutFile(studio.roomLayoutFile)
      if (layoutFile) {
        const destPath = join(getLayoutsDir(), `studio_${created.id}${layoutFile.extension}`)
        writeFileSync(destPath, layoutFile.data)
        upsertLayoutFile({
          studioId: created.id,
          filePath: destPath,
          originalName: layoutFile.originalName,
          pageWidthPt: layoutFile.pageWidthPt,
          pageHeightPt: layoutFile.pageHeightPt
        })
      }
      // Dropped rather than written when it isn't a real PDF — see decodePatchbayFile. The studio
      // still imports; it just arrives without a patchbay.
      const patchbayFile = decodePatchbayFile(studio.patchbayFile)
      if (patchbayFile) {
        const destPath = join(getPatchbaysDir(), `studio_${created.id}.pdf`)
        writeFileSync(destPath, patchbayFile.data)
        upsertPatchbayFile({
          studioId: created.id,
          filePath: destPath,
          originalName: patchbayFile.originalName,
          pageWidthPt: patchbayFile.pageWidthPt,
          pageHeightPt: patchbayFile.pageHeightPt
        })
      }
    }
    return { imported }
  })
  return run()
}
