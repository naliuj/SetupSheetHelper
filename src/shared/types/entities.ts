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
  /** Custom (non-Berklee) studios only: opts a studio without a building into seeing Faculty
   *  Reserve gear, which otherwise only appears for real Berklee studios (buildingId != null). */
  facultyReserveEnabled: boolean
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

/** Used by the "copy gear from other studios" picker so items can be grouped/labeled by origin. */
export interface MicWithStudio extends Mic {
  studioName: string
}

export interface OutboardGearWithStudio extends OutboardGear {
  studioName: string
}

export const APP_SETTINGS_KEYS = {
  facultyReserveEnabled: 'faculty_reserve_enabled',
  defaultEngineerName: 'default_engineer_name',
  defaultPdfExportInclude: 'default_pdf_export_include'
} as const
