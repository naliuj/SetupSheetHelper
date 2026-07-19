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

interface PdfLayoutPrefsState {
  gridStyle: PdfGridStyle
  zebraStripes: boolean
  headerShaded: boolean
  accentColor: string | null
  dateFormat: PdfDateFormat
  load(): Promise<void>
  setGridStyle(style: PdfGridStyle): Promise<void>
  setZebraStripes(on: boolean): Promise<void>
  setHeaderShaded(on: boolean): Promise<void>
  setAccentColor(color: string | null): Promise<void>
  setDateFormat(format: PdfDateFormat): Promise<void>
}

export const usePdfLayoutPrefsStore = create<PdfLayoutPrefsState>((set) => ({
  gridStyle: 'full',
  zebraStripes: false,
  headerShaded: false,
  accentColor: null,
  dateFormat: 'us',

  load: async () => {
    const [grid, zebra, header, accent, date] = await Promise.all([
      window.api.settings.get(APP_SETTINGS_KEYS.pdfGridStyle),
      window.api.settings.get(APP_SETTINGS_KEYS.pdfZebraStripes),
      window.api.settings.get(APP_SETTINGS_KEYS.pdfHeaderShaded),
      window.api.settings.get(APP_SETTINGS_KEYS.pdfAccentColor),
      window.api.settings.get(APP_SETTINGS_KEYS.pdfDateFormat)
    ])
    set({
      gridStyle: parsePdfGridStyle(grid),
      zebraStripes: parsePdfBoolSetting(zebra),
      headerShaded: parsePdfBoolSetting(header),
      accentColor: parsePdfAccentColor(accent),
      dateFormat: parsePdfDateFormat(date)
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
  }
}))
