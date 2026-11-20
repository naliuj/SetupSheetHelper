import { create } from 'zustand'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import {
  parsePdfAccentColor,
  parsePdfBoolSetting,
  parsePdfDateFormat,
  parsePdfGridStyle,
  serializePdfBoolSetting,
  type PdfDateFormat,
  type PdfGridStyle
} from '@shared/constants/pdfLayout'
import type { BandExportLayout } from '@shared/types/ipc'

const BAND_EXPORT_LAYOUT_KEY = APP_SETTINGS_KEYS.bandExportLayout
const parseBandExportLayout = (raw: string | null): BandExportLayout =>
  raw === 'pagePerBand' ? 'pagePerBand' : 'continuous'

interface PdfLayoutPrefsState {
  gridStyle: PdfGridStyle
  zebraStripes: boolean
  headerShaded: boolean
  accentColor: string | null
  dateFormat: PdfDateFormat
  /** How a sheet with bands exports, shared by the PDF and spreadsheet dialogs. */
  bandExportLayout: BandExportLayout
  /** Whether multi-band exports mark changes between bands; on unless turned off. */
  markBandChanges: boolean
  /** Whether table mode tints what changed from the band before; on unless turned off. It lives
   *  here with the export's band prefs rather than in a store of its own. */
  showBandChanges: boolean
  load(): Promise<void>
  setGridStyle(style: PdfGridStyle): Promise<void>
  setZebraStripes(on: boolean): Promise<void>
  setHeaderShaded(on: boolean): Promise<void>
  setAccentColor(color: string | null): Promise<void>
  setDateFormat(format: PdfDateFormat): Promise<void>
  setBandExportLayout(layout: BandExportLayout): Promise<void>
  setMarkBandChanges(on: boolean): Promise<void>
  setShowBandChanges(on: boolean): Promise<void>
}

export const usePdfLayoutPrefsStore = create<PdfLayoutPrefsState>((set) => ({
  gridStyle: 'full',
  zebraStripes: false,
  headerShaded: false,
  accentColor: null,
  dateFormat: 'us',
  bandExportLayout: 'continuous',
  markBandChanges: true,
  showBandChanges: true,

  load: async () => {
    const [grid, zebra, header, accent, date, bandLayout, markChanges, showChanges] = await Promise.all([
      window.api.settings.get(APP_SETTINGS_KEYS.pdfGridStyle),
      window.api.settings.get(APP_SETTINGS_KEYS.pdfZebraStripes),
      window.api.settings.get(APP_SETTINGS_KEYS.pdfHeaderShaded),
      window.api.settings.get(APP_SETTINGS_KEYS.pdfAccentColor),
      window.api.settings.get(APP_SETTINGS_KEYS.pdfDateFormat),
      window.api.settings.get(BAND_EXPORT_LAYOUT_KEY),
      window.api.settings.get(APP_SETTINGS_KEYS.markBandChanges),
      window.api.settings.get(APP_SETTINGS_KEYS.showBandChanges)
    ])
    set({
      gridStyle: parsePdfGridStyle(grid),
      zebraStripes: parsePdfBoolSetting(zebra),
      headerShaded: parsePdfBoolSetting(header),
      accentColor: parsePdfAccentColor(accent),
      dateFormat: parsePdfDateFormat(date),
      bandExportLayout: parseBandExportLayout(bandLayout),
      markBandChanges: markChanges !== '0',
      showBandChanges: showChanges !== '0'
    })
  },

  setGridStyle: async (style) => {
    set({ gridStyle: style })
    await window.api.settings.set(APP_SETTINGS_KEYS.pdfGridStyle, style)
  },

  setZebraStripes: async (on) => {
    set({ zebraStripes: on })
    await window.api.settings.set(APP_SETTINGS_KEYS.pdfZebraStripes, serializePdfBoolSetting(on))
  },

  setHeaderShaded: async (on) => {
    set({ headerShaded: on })
    await window.api.settings.set(APP_SETTINGS_KEYS.pdfHeaderShaded, serializePdfBoolSetting(on))
  },

  setAccentColor: async (color) => {
    set({ accentColor: color })
    await window.api.settings.set(APP_SETTINGS_KEYS.pdfAccentColor, color ?? '')
  },

  setDateFormat: async (format) => {
    set({ dateFormat: format })
    await window.api.settings.set(APP_SETTINGS_KEYS.pdfDateFormat, format)
  },

  setBandExportLayout: async (layout) => {
    set({ bandExportLayout: layout })
    await window.api.settings.set(BAND_EXPORT_LAYOUT_KEY, layout)
  },

  setMarkBandChanges: async (on) => {
    set({ markBandChanges: on })
    await window.api.settings.set(APP_SETTINGS_KEYS.markBandChanges, on ? '1' : '0')
  },

  setShowBandChanges: async (on) => {
    set({ showBandChanges: on })
    await window.api.settings.set(APP_SETTINGS_KEYS.showBandChanges, on ? '1' : '0')
  }
}))
