import { create } from 'zustand'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import type { MarkTool } from '@shared/types/setup'
import { DEFAULT_MARK_SIZE, MARK_COLORS, MARK_SIZES } from '@renderer/pages/SetupEditor/canvas/markGeometry'

/** What the markup toolbar's tool buttons can pick: a drawing tool, the eraser, or back to the
 *  ordinary select-and-move behavior. */
export type MarkupTool = MarkTool | 'eraser' | 'select'

const TOOLS: MarkupTool[] = ['select', 'pen', 'highlighter', 'line', 'arrow', 'ellipse', 'rect', 'eraser']

interface MarkupPrefsState {
  tool: MarkupTool
  color: string
  size: number
  load(): Promise<void>
  set(patch: Partial<Pick<MarkupPrefsState, 'tool' | 'color' | 'size'>>): void
}

/** The markup toolbar's last tool, color and size, remembered across launches so picking the pen
 *  back up carries on where it left off. */
export const useMarkupPrefsStore = create<MarkupPrefsState>((set, get) => ({
  tool: 'pen',
  color: MARK_COLORS[0].hex,
  size: DEFAULT_MARK_SIZE,

  load: async () => {
    try {
      const raw = await window.api.settings.get(APP_SETTINGS_KEYS.markupPrefs)
      const saved = raw ? (JSON.parse(raw) as Partial<MarkupPrefsState>) : {}
      set({
        tool: TOOLS.includes(saved.tool as MarkupTool) ? (saved.tool as MarkupTool) : 'pen',
        color: MARK_COLORS.some((c) => c.hex === saved.color) ? (saved.color as string) : MARK_COLORS[0].hex,
        size: (MARK_SIZES as readonly number[]).includes(saved.size as number) ? (saved.size as number) : DEFAULT_MARK_SIZE
      })
    } catch {
      // Unreadable setting: keep the defaults.
    }
  },

  set: (patch) => {
    set(patch)
    const { tool, color, size } = get()
    void window.api.settings.set(APP_SETTINGS_KEYS.markupPrefs, JSON.stringify({ tool, color, size }))
  }
}))
