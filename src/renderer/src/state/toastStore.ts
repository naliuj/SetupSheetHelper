import { create } from 'zustand'

const AUTO_DISMISS_MS = 5000

interface ToastState {
  message: string | null
  onUndo: (() => void) | null
  show(message: string, onUndo?: () => void): void
  dismiss(): void
}

/** A single ephemeral, bottom-of-screen notification — currently only used for the
 *  "Deleted N row(s)/block(s)" undo toast (see setupStore.removeItems / layoutStore.removeBlocks).
 *  Deliberately separate from either editor store: it's UI-only state, not part of the
 *  undo/redo history or anything persisted. */
export const useToastStore = create<ToastState>((set) => {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    message: null,
    onUndo: null,
    show(message, onUndo) {
      if (timer) clearTimeout(timer)
      set({ message, onUndo: onUndo ?? null })
      timer = setTimeout(() => set({ message: null, onUndo: null }), AUTO_DISMISS_MS)
    },
    dismiss() {
      if (timer) clearTimeout(timer)
      set({ message: null, onUndo: null })
    }
  }
})
