import { create } from 'zustand'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import {
  ALL_COLUMN_KEYS,
  parseVisibleColumns,
  serializeVisibleColumns,
  type SetupColumnKey
} from '@shared/constants/setupColumns'

interface ColumnPrefsState {
  /** The columns a newly created setup starts with. Loaded from app_settings; defaults to all
   *  columns when never configured. A new setup snapshots this at creation (see setupsRepo). */
  defaultVisibleColumns: SetupColumnKey[]
  load(): Promise<void>
  setDefault(columns: SetupColumnKey[]): Promise<void>
}

export const useColumnPrefsStore = create<ColumnPrefsState>((set) => ({
  defaultVisibleColumns: [...ALL_COLUMN_KEYS],

  load: async () => {
    const saved = await window.api.settings.get(APP_SETTINGS_KEYS.defaultVisibleColumns)
    set({ defaultVisibleColumns: parseVisibleColumns(saved) })
  },

  setDefault: async (columns) => {
    set({ defaultVisibleColumns: parseVisibleColumns(serializeVisibleColumns(columns)) })
    await window.api.settings.set(APP_SETTINGS_KEYS.defaultVisibleColumns, serializeVisibleColumns(columns))
  }
}))
