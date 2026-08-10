import { create } from 'zustand'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import {
  ALL_COLUMN_KEYS,
  parseVisibleColumns,
  serializeVisibleColumns,
  parseColumnOrder,
  serializeColumnOrder,
  type SetupColumnKey
} from '@shared/constants/setupColumns'

interface ColumnPrefsState {
  /** The columns a newly created setup starts with. Loaded from app_settings; defaults to all
   *  columns when never configured. A new setup snapshots this at creation (see setupsRepo). */
  defaultVisibleColumns: SetupColumnKey[]
  /** The left-to-right column order a newly created setup starts with — covers every key, hidden
   *  ones included, same as the per-setup order. Snapshotted at creation alongside the above. */
  defaultColumnOrder: SetupColumnKey[]
  load(): Promise<void>
  setDefault(columns: SetupColumnKey[]): Promise<void>
  setDefaultOrder(order: SetupColumnKey[]): Promise<void>
}

export const useColumnPrefsStore = create<ColumnPrefsState>((set) => ({
  defaultVisibleColumns: [...ALL_COLUMN_KEYS],
  defaultColumnOrder: [...ALL_COLUMN_KEYS],

  load: async () => {
    const [savedVisible, savedOrder] = await Promise.all([
      window.api.settings.get(APP_SETTINGS_KEYS.defaultVisibleColumns),
      window.api.settings.get(APP_SETTINGS_KEYS.defaultColumnOrder)
    ])
    set({
      defaultVisibleColumns: parseVisibleColumns(savedVisible),
      defaultColumnOrder: parseColumnOrder(savedOrder)
    })
  },

  setDefault: async (columns) => {
    set({ defaultVisibleColumns: parseVisibleColumns(serializeVisibleColumns(columns)) })
    await window.api.settings.set(APP_SETTINGS_KEYS.defaultVisibleColumns, serializeVisibleColumns(columns))
  },

  // Unlike setDefault above, this must NOT round-trip through a canonical-order normalizer — the
  // caller's order is the payload. parseColumnOrder only repairs (dedupes, drops unknown keys,
  // appends anything missing); it preserves the order it's given.
  setDefaultOrder: async (order) => {
    const next = parseColumnOrder(JSON.stringify(order))
    set({ defaultColumnOrder: next })
    await window.api.settings.set(APP_SETTINGS_KEYS.defaultColumnOrder, serializeColumnOrder(next))
  }
}))
