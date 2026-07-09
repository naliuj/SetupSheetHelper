export interface Building {
  id: number
  name: string
  createdAt: string
}

export interface Studio {
  id: number
  buildingId: number | null
  folderId: number | null
  name: string
  isTemporary: boolean
  sortOrder: number
  createdAt: string
  /** Real Berklee (building-bound) studios are always true. Custom studios choose at creation
   *  — false means the studio patches through standalone preamps instead of a console, and
   *  gets a Preamps locker instead of relying on the setup sheet's free-text Channel column. */
  hasConsole: boolean
}

export interface RoomLayoutFile {
  id: number
  studioId: number
  filePath: string
  originalName: string | null
  /** PDF-only — the page size in points from pdfjs. Null for image layouts and for PDFs whose
   *  dimensions failed to parse; the live canvas measures its own rendered size regardless. */
  pageWidthPt: number | null
  pageHeightPt: number | null
  importedAt: string
}

export type MicPoolType = 'studio' | 'building' | 'faculty_reserve' | 'personal' | 'setup'
export type OutboardPoolType = 'studio' | 'building' | 'faculty_reserve' | 'personal' | 'setup'

export interface Mic {
  id: number
  poolType: MicPoolType
  studioId: number | null
  buildingId: number | null
  setupId: number | null
  name: string
  manufacturer: string | null
  category: string | null
  notes: string | null
  quantity: number
  sortOrder: number
}

export interface OutboardGear {
  id: number
  poolType: OutboardPoolType
  studioId: number | null
  buildingId: number | null
  setupId: number | null
  name: string
  manufacturer: string | null
  category: string | null
  notes: string | null
  quantity: number
  sortOrder: number
}

/** Console-less studios' standalone preamps — only a studio locker and a session-scoped
 *  borrowed-gear pool make sense here, unlike mics/outboard's full 5-pool system. `channels`
 *  plays the same role `quantity` plays for mics/outboard: how many times this exact unit can
 *  be picked across a setup's rows before it's "full". */
export type PreampPoolType = 'studio' | 'setup'

export interface Preamp {
  id: number
  poolType: PreampPoolType
  studioId: number | null
  setupId: number | null
  name: string
  manufacturer: string | null
  category: string | null
  notes: string | null
  channels: number
  sortOrder: number
}

/** Used by the "copy gear from other studios" picker so items can be grouped/labeled by origin. */
export interface MicWithStudio extends Mic {
  studioName: string
}

export interface OutboardGearWithStudio extends OutboardGear {
  studioName: string
}

export const APP_SETTINGS_KEYS = {
  defaultEngineerName: 'default_engineer_name',
  defaultPdfExportInclude: 'default_pdf_export_include'
} as const
