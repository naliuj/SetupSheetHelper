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

/** A single setup's own layout override — either a blank sheet or its own imported file, taking
 *  priority over the studio's shared RoomLayoutFile. See effectiveLayoutRepo.ts for resolution. */
export interface SetupLayoutOverride {
  id: number
  setupId: number
  kind: 'blank' | 'file'
  filePath: string | null
  originalName: string | null
  pageWidthPt: number | null
  pageHeightPt: number | null
  importedAt: string
}

/** What Layout Mode should actually render for a setup, after resolving the per-setup override
 *  (if any) against the studio's shared layout file. Null means neither exists — gate the user. */
export type EffectiveLayout =
  | { kind: 'blank' }
  | { kind: 'file'; filePath: string; originalName: string | null; pageWidthPt: number | null; pageHeightPt: number | null }
  | null

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

/** Console-less studios' standalone preamps — full 5-pool system matching mics/outboard exactly
 *  (studio locker, session-scoped borrowed gear, building office stock, personal gear, and
 *  Berklee-only faculty reserve). `channels` plays the same role `quantity` plays for
 *  mics/outboard: how many times this exact unit can be picked across a setup's rows before
 *  it's "full". */
export type PreampPoolType = 'studio' | 'building' | 'faculty_reserve' | 'personal' | 'setup'

export interface Preamp {
  id: number
  poolType: PreampPoolType
  studioId: number | null
  buildingId: number | null
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
  defaultPdfExportInclude: 'default_pdf_export_include',
  /** '1' | '0'. Remembered "Colored rows" choice from the Export Options modal — a general
   *  preference, not something to re-toggle on every export. Absent → off. */
  defaultPdfExportColoredRows: 'default_pdf_export_colored_rows',
  theme: 'theme',
  berkleeFeaturesEnabled: 'berklee_features_enabled',
  /** JSON array of SetupColumnKey — the columns a newly created setup starts with. Absent → all. */
  defaultVisibleColumns: 'default_visible_columns',
  /** PdfGridStyle: 'none' | 'full' | 'rows' | 'outer'. Absent/garbage → 'full'. */
  pdfGridStyle: 'pdf_grid_style',
  /** '1' | '0'. Absent → off. */
  pdfZebraStripes: 'pdf_zebra_stripes',
  /** '1' | '0'. Absent → off. */
  pdfHeaderShaded: 'pdf_header_shaded',
  /** Hex string '#rrggbb', or absent/blank → no accent tint anywhere in the export. */
  pdfAccentColor: 'pdf_accent_color',
  /** PdfDateFormat: 'us' | 'us-long' | 'iso' | 'eu'. Absent/garbage → 'us'. */
  pdfDateFormat: 'pdf_date_format',
  /** JSON object { [keybindActionId]: comboString } — only entries that differ from
   *  KEYBIND_ACTIONS' defaults are stored. Absent/garbage → {} (every action at its default). */
  keybindOverrides: 'keybind_overrides',
  /** HomeLayout: 'blocks' | 'tree' | 'twoPane' | 'miller' — home screen presentation. Absent/garbage → 'blocks'. */
  homeLayout: 'home_layout',
  /** Last app version (from app.getVersion()) the user has seen the "What's New" changelog for.
   *  Absent → fresh install; the current version is recorded silently without showing the modal. */
  lastSeenVersion: 'last_seen_version'
} as const
