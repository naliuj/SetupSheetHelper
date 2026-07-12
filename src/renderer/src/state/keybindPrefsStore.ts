import { create } from 'zustand'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { KEYBIND_ACTIONS, KEYBIND_ACTIONS_BY_ID, scopesOverlap, type KeybindActionDef } from '@shared/constants/keybindActions'

function parseOverrides(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw) as unknown
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
    const result: Record<string, string> = {}
    for (const [id, combo] of Object.entries(obj as Record<string, unknown>)) {
      if (KEYBIND_ACTIONS_BY_ID[id] && typeof combo === 'string') result[id] = combo
    }
    return result
  } catch {
    return {}
  }
}

interface KeybindPrefsState {
  /** Only entries that differ from KEYBIND_ACTIONS' defaults. */
  overrides: Record<string, string>
  load(): Promise<void>
  /** The combo currently in effect for an action — its override, or its default. */
  resolve(actionId: string): string
  setBinding(actionId: string, combo: string): Promise<void>
  resetBinding(actionId: string): Promise<void>
  resetAll(): Promise<void>
  /** Other actions whose resolved combo matches this one's AND whose scope overlaps it — the
   *  live conflict list the Keybinds editor shows inline per row. Table vs layout scope never
   *  overlaps (mutually exclusive modes), so e.g. the two default-Delete entries never appear
   *  here for each other. */
  conflictsFor(actionId: string): KeybindActionDef[]
}

export const useKeybindPrefsStore = create<KeybindPrefsState>((set, get) => ({
  overrides: {},

  load: async () => {
    const saved = await window.api.settings.get(APP_SETTINGS_KEYS.keybindOverrides)
    set({ overrides: parseOverrides(saved) })
  },

  resolve: (actionId) => {
    const action = KEYBIND_ACTIONS_BY_ID[actionId]
    return get().overrides[actionId] ?? action?.defaultCombo ?? ''
  },

  setBinding: async (actionId, combo) => {
    const next = { ...get().overrides, [actionId]: combo }
    set({ overrides: next })
    await window.api.settings.set(APP_SETTINGS_KEYS.keybindOverrides, JSON.stringify(next))
  },

  resetBinding: async (actionId) => {
    const next = { ...get().overrides }
    delete next[actionId]
    set({ overrides: next })
    await window.api.settings.set(APP_SETTINGS_KEYS.keybindOverrides, JSON.stringify(next))
  },

  resetAll: async () => {
    set({ overrides: {} })
    await window.api.settings.set(APP_SETTINGS_KEYS.keybindOverrides, JSON.stringify({}))
  },

  conflictsFor: (actionId) => {
    const action = KEYBIND_ACTIONS_BY_ID[actionId]
    if (!action) return []
    const combo = get().resolve(actionId)
    return KEYBIND_ACTIONS.filter(
      (other) =>
        other.id !== actionId && get().resolve(other.id) === combo && scopesOverlap(action.scope, other.scope)
    )
  }
}))
