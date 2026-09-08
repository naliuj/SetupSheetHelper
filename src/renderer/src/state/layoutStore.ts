import { create } from 'zustand'
import { temporal } from 'zundo'
import type { RoomLayoutBlockDraft } from '@shared/types/setup'
import { createSetupStore, useSetupStore, type SaveError } from './setupStore'
import { useToastStore } from './toastStore'

/** What createLayoutStore's save() needs from its paired setup store — just enough to read the
 *  current setupId at save time. Typed off createSetupStore's own return shape so it always
 *  matches, rather than hand-duplicating the relevant slice of SetupState. */
type SetupStoreApi = ReturnType<typeof createSetupStore>

function newDraftId(): string {
  return crypto.randomUUID()
}

/** Longest a drag/resize is assumed to still be live. Past this, save() treats the gesture as
 *  abandoned (an end callback that never fired) and saves anyway rather than staying latched.
 *  Comfortably longer than any real mouse gesture between two autosave ticks. */
const GESTURE_MAX_MS = 10_000

const DEFAULT_SIZE = 44
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
// A bigger, discrete jump than the per-wheel-tick step in LayoutStage's handleWheel — keyboard/
// menu zoom is a deliberate single action, not a continuous gesture.
const KEYBOARD_ZOOM_STEP = 1.2

interface LayoutState {
  blocks: RoomLayoutBlockDraft[]
  selectedBlockIds: Set<number | string>
  zoomScale: number
  panX: number
  panY: number
  isDirty: boolean
  isSaving: boolean
  /** The last save failure, or null when the last save succeeded. Carries a timestamp so two
   *  identical consecutive failures are still distinct values — the retry effect in
   *  SetupEditorPane keys off this changing. */
  saveError: SaveError | null
  /** When the in-progress drag/resize started, or null when there is none. save() is a no-op for
   *  as long as it is set: saving replaces the block list with the rows the database hands back,
   *  which remounts a freshly placed block under its new id and kills whatever gesture the user
   *  has on it. Every gesture ends with a store write, and that write re-arms autosave, so
   *  nothing is lost by waiting.
   *
   *  A timestamp rather than a boolean because this gate is the only thing standing between a
   *  dirty layout and the database. Konva's end callback is not guaranteed to run — the pane can
   *  unmount mid-drag, or a handler above it can throw — and a stuck `true` silently disabled
   *  EVERY subsequent save for the life of the store: autosave, the unmount flush, Split View's
   *  close, and the popped-out window's close handshake all call this same save(). Expiring the
   *  gesture bounds that failure to GESTURE_MAX_MS instead of forever. */
  gestureStartedAt: number | null
  beginGesture(): void
  endGesture(): void
  /** Bumped whenever the Layout Mode gate resolves (blank sheet chosen, or a file committed to
   *  the studio/setup) — LayoutBackground depends on this to know to re-fetch, since resolving
   *  the gate doesn't change studioId/setupId (the effect's other deps) on its own. */
  layoutBackgroundVersion: number

  loadForSetup(setupId: number | null): Promise<void>
  addBlock(
    label: string,
    shape: 'rect' | 'circle',
    color: string,
    x: number,
    y: number,
    width?: number,
    height?: number,
    personName?: string | null
  ): string
  updateBlockTransform(
    id: number | string,
    patch: Partial<Pick<RoomLayoutBlockDraft, 'x' | 'y' | 'width' | 'height' | 'rotation'>>
  ): void
  renameBlock(id: number | string, label: string, personName?: string | null): void
  updateBlockColor(id: number | string, color: string): void
  duplicateBlocks(ids: (number | string)[]): void
  removeBlocks(ids: (number | string)[]): void
  moveBlocksBy(ids: (number | string)[], dx: number, dy: number): void
  selectBlock(id: number | string | null): void
  toggleBlock(id: number | string): void
  selectBlocksInRect(ids: (number | string)[]): void
  selectAllBlocks(): void
  setZoomPan(zoomScale: number, panX: number, panY: number): void
  zoomIn(): void
  zoomOut(): void
  resetView(): void
  save(): Promise<void>
  bumpLayoutBackgroundVersion(): void
}

/** Builds one independent layout-store instance, paired to a specific setup-store instance.
 *  Layout Mode's store is fully independent of setupStore/Table Mode (no shared items, no
 *  shared fields) EXCEPT one deliberate coupling point: save() reads the paired setup store's
 *  setupId directly at save time (rather than duplicating it here), so a brand-new setup's
 *  first-ever placed block always has a valid setup id to save against without explicit
 *  cross-store wiring at every call site. `setupStoreApi` is that pairing — passed in rather
 *  than importing the singleton, so Split View's second pane can wire its own layout-store
 *  instance to its own setup-store instance instead of both panes fighting over one.
 *
 *  Selection is a Set (multi-select), following Table Mode's setupStore.selectedItemIds
 *  pattern. zoomScale/panX/panY are purely transient view state — layered on top of
 *  LayoutStage.tsx's own fit-to-container calc, never persisted to the DB, reset whenever a
 *  different setup loads. */
export function createLayoutStore(setupStoreApi: SetupStoreApi) {
  const store = create<LayoutState>()(
  temporal(
    (set, get) => ({
      blocks: [],
      selectedBlockIds: new Set<number | string>(),
      zoomScale: 1,
      panX: 0,
      panY: 0,
      isDirty: false,
      isSaving: false,
      saveError: null,
      gestureStartedAt: null,
      beginGesture: () => set({ gestureStartedAt: Date.now() }),
      endGesture: () => set({ gestureStartedAt: null }),
      layoutBackgroundVersion: 0,

      loadForSetup: async (setupId) => {
        store.temporal.getState().clear()
        if (!setupId) {
          set({ blocks: [], selectedBlockIds: new Set(), zoomScale: 1, panX: 0, panY: 0, isDirty: false })
          return
        }
        const blocks = await window.api.roomLayoutBlocks.listBySetup(setupId)
        set({ blocks, selectedBlockIds: new Set(), zoomScale: 1, panX: 0, panY: 0, isDirty: false })
      },

      addBlock: (label, shape, color, x, y, width = DEFAULT_SIZE, height = DEFAULT_SIZE, personName = null) => {
        const id = newDraftId()
        const maxZ = get().blocks.reduce((max, b) => Math.max(max, b.zIndex), 0)
        const draft: RoomLayoutBlockDraft = {
          id,
          label,
          shape,
          color,
          x,
          y,
          width,
          height,
          rotation: 0,
          zIndex: maxZ + 1,
          personName
        }
        set({ blocks: [...get().blocks, draft], isDirty: true, selectedBlockIds: new Set([id]) })
        return id
      },

      updateBlockTransform: (id, patch) =>
        set((state) => ({
          blocks: state.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
          isDirty: true
        })),

      renameBlock: (id, label, personName) =>
        set((state) => ({
          blocks: state.blocks.map((b) =>
            b.id === id ? { ...b, label, ...(personName !== undefined ? { personName } : {}) } : b
          ),
          isDirty: true
        })),

      updateBlockColor: (id, color) =>
        set((state) => ({
          blocks: state.blocks.map((b) => (b.id === id ? { ...b, color } : b)),
          isDirty: true
        })),

      // Duplicates every listed block together (e.g. the whole current selection on Cmd+D),
      // offsetting all by the same delta and selecting the new copies as the new selection.
      duplicateBlocks: (ids) =>
        set((state) => {
          const idSet = new Set(ids)
          const originals = state.blocks.filter((b) => idSet.has(b.id))
          if (originals.length === 0) return {}
          let maxZ = state.blocks.reduce((max, b) => Math.max(max, b.zIndex), 0)
          const duplicates: RoomLayoutBlockDraft[] = originals.map((original) => {
            maxZ += 1
            return { ...original, id: newDraftId(), x: original.x + 20, y: original.y + 20, zIndex: maxZ }
          })
          return {
            blocks: [...state.blocks, ...duplicates],
            isDirty: true,
            selectedBlockIds: new Set(duplicates.map((d) => d.id))
          }
        }),

      removeBlocks: (ids) => {
        set((state) => {
          const idSet = new Set(ids)
          const selectedBlockIds = new Set([...state.selectedBlockIds].filter((id) => !idSet.has(id)))
          return {
            blocks: state.blocks.filter((b) => !idSet.has(b.id)),
            selectedBlockIds,
            isDirty: true
          }
        })
        if (ids.length > 0) {
          useToastStore
            .getState()
            .show(`Deleted ${ids.length} block${ids.length === 1 ? '' : 's'}`, () => {
              store.temporal.getState().undo()
              // Autosave (1s) beats the toast (5s), so by the time Undo is clicked the delete is
              // already committed. zundo does not restore isDirty, so without this the blocks
              // reappear on screen and are never written back.
              set({ isDirty: true })
            })
        }
      },

      // Shifts every listed block by the same (dx, dy) — used for group-drag: dragging one
      // block that's part of a larger selection moves every other selected block along with it
      // by the same delta. Only the actively-dragged block goes through its own Konva
      // dragBoundFunc clamp (LayoutBlockIcon.tsx); other group members shift unclamped, so a
      // block dragged hard against the room boundary could carry the rest slightly past it —
      // an accepted simplification rather than full group-bounding-box clamping.
      moveBlocksBy: (ids, dx, dy) =>
        set((state) => {
          const idSet = new Set(ids)
          return {
            blocks: state.blocks.map((b) => (idSet.has(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b)),
            isDirty: true
          }
        }),

      selectBlock: (id) => set({ selectedBlockIds: id != null ? new Set([id]) : new Set() }),

      toggleBlock: (id) =>
        set((state) => {
          const next = new Set(state.selectedBlockIds)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return { selectedBlockIds: next }
        }),

      selectBlocksInRect: (ids) => set({ selectedBlockIds: new Set(ids) }),

      selectAllBlocks: () => set((state) => ({ selectedBlockIds: new Set(state.blocks.map((b) => b.id)) })),

      setZoomPan: (zoomScale, panX, panY) =>
        set({ zoomScale: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomScale)), panX, panY }),

      // Scales in place (pan unchanged) — keyboard/menu zoom has no cursor position to anchor to,
      // unlike handleWheel's cursor-centered zoom in LayoutStage.tsx.
      zoomIn: () =>
        set((state) => ({ zoomScale: Math.min(MAX_ZOOM, state.zoomScale * KEYBOARD_ZOOM_STEP) })),

      zoomOut: () =>
        set((state) => ({ zoomScale: Math.max(MIN_ZOOM, state.zoomScale / KEYBOARD_ZOOM_STEP) })),

      resetView: () => set({ zoomScale: 1, panX: 0, panY: 0 }),

      save: async () => {
        const setupId = setupStoreApi.getState().setupId
        if (!setupId) return
        // Leave isDirty set: the write that ends the gesture changes `blocks`, which re-arms the
        // autosave timer, so this save is deferred rather than dropped. A gesture older than
        // GESTURE_MAX_MS is treated as abandoned — see gestureStartedAt — and cleared here so the
        // save below proceeds rather than the store staying permanently unsaveable.
        const gestureStartedAt = get().gestureStartedAt
        if (gestureStartedAt != null) {
          if (Date.now() - gestureStartedAt < GESTURE_MAX_MS) return
          set({ gestureStartedAt: null })
        }
        const state = get()
        set({ isSaving: true })
        try {
          const { blocks: saved, idMap } = await window.api.roomLayoutBlocks.saveForSetup(
            setupId,
            state.blocks.map((b) => ({ ...b }))
          )
          // Only the pre-await snapshot was written. If the user changed anything while the IPC
          // was in flight — a keyboard nudge, a rename, a recolor, a delete — adopting `saved`
          // wholesale would both discard that edit from the database AND roll it back off the
          // screen. In that case keep the live blocks and apply nothing but the id swap, and stay
          // dirty so the next autosave tick writes them.
          const currentBlocks = get().blocks
          const changedDuringSave = currentBlocks !== state.blocks
          const nextBlocks = changedDuringSave
            ? currentBlocks.map((b) =>
                typeof b.id === 'string' && idMap[b.id] != null ? { ...b, id: idMap[b.id] } : b
              )
            : saved

          // A just-dropped block is selected under its draft id. Saving replaces it with the row's
          // numeric id, and leaving the selection pointing at the draft left its Transformer
          // attached to a Konva node that no longer existed: the block looked deselected while
          // stale resize handles kept painting, and a resize begun in that window bailed out
          // before resetting the node's scale. Re-key the selection so it survives the save, and
          // drop anything that no longer resolves to a block at all.
          const nextIds = new Set<number | string>(nextBlocks.map((b) => b.id))
          const selectedBlockIds = new Set<number | string>()
          for (const id of get().selectedBlockIds) {
            const mapped = typeof id === 'string' ? (idMap[id] ?? id) : id
            if (nextIds.has(mapped)) selectedBlockIds.add(mapped)
          }
          set({
            blocks: nextBlocks,
            selectedBlockIds,
            isDirty: changedDuringSave,
            isSaving: false,
            saveError: null
          })
        } catch (err) {
          // See setupStore.save() — never rethrows, for the same reason.
          set({
            isSaving: false,
            saveError: { message: err instanceof Error ? err.message : String(err), at: Date.now() }
          })
        }
      },

      bumpLayoutBackgroundVersion: () => set((state) => ({ layoutBackgroundVersion: state.layoutBackgroundVersion + 1 }))
    }),
    {
      partialize: (state) => ({ blocks: state.blocks }),
      // Without an equality check zundo snapshots on EVERY set() — panning/zooming
      // (setZoomPan per mousemove/wheel tick) and selection changes would flush all 100
      // real undo entries in one gesture. Blocks are immutably replaced on every real
      // edit, so a reference compare is exact.
      equality: (past, current) => past.blocks === current.blocks,
      limit: 100
    }
  )
  )
  return store
}

/** The app-wide default instance, paired to the default setupStore singleton — every existing
 *  single-setup call site keeps using this unchanged. Split View's second pane gets its own
 *  separate `createLayoutStore(...)` instance, paired to that pane's own setup store, instead
 *  (see layoutStoreContext.tsx); this singleton remains pane A's store. */
export const useLayoutStore = createLayoutStore(useSetupStore)
