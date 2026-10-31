import { create } from "zustand";
import { temporal } from "zundo";
import type { PatchbayCableDraft } from "@shared/types/patchbay";
import type { createSetupStore } from "./setupStore";
import { useSetupStore } from "./setupStore";
import { MIN_ZOOM, MAX_ZOOM } from "./layoutStore";

type SetupStoreApi = ReturnType<typeof createSetupStore>;

/** Same meaning as layoutStore's: past this, a gesture whose end never arrived is treated as
 *  abandoned and saving resumes. */
const GESTURE_MAX_MS = 10_000;
const KEYBOARD_ZOOM_STEP = 1.2;

export type NewCable = Omit<PatchbayCableDraft, "id" | "zIndex">;

interface PatchbayState {
  cables: PatchbayCableDraft[];
  selectedCableIds: Set<number | string>;
  zoomScale: number;
  panX: number;
  panY: number;
  isDirty: boolean;
  isSaving: boolean;
  saveError: { message: string; at: number } | null;
  /** Set while a drag is in progress, so autosave waits for it to finish — see layoutStore. */
  gestureStartedAt: number | null;
  beginGesture(): void;
  endGesture(): void;
  loadForSetup(setupId: number | null): Promise<void>;
  addCable(cable: NewCable): string;
  updateCable(id: number | string, patch: Partial<NewCable>): void;
  updateCables(
    ids: (number | string)[],
    patch: Partial<Pick<NewCable, "color" | "sag">>,
  ): void;
  removeCables(ids: (number | string)[]): void;
  selectCable(id: number | string, additive: boolean): void;
  /** A marquee's result: replaces the selection, or adds to it when `additive`. */
  selectCables(ids: (number | string)[], additive: boolean): void;
  clearSelection(): void;
  setZoomPan(zoomScale: number, panX: number, panY: number): void;
  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
  save(): Promise<void>;
}

/** One setup's patch cables — Patchbay Mode's counterpart to layoutStore, built the same way:
 *  zundo undo over `cables` only, a gesture gate so autosave never writes a half-finished drag,
 *  and a save that swaps draft ids for row ids in place (and through the undo history) without
 *  recording a step. Split View's second pane gets its own instance; see patchbayStoreContext. */
export function createPatchbayStore(setupStoreApi: SetupStoreApi) {
  const store = create<PatchbayState>()(
    temporal(
      (set, get) => ({
        cables: [],
        selectedCableIds: new Set<number | string>(),
        zoomScale: 1,
        panX: 0,
        panY: 0,
        isDirty: false,
        isSaving: false,
        saveError: null,
        gestureStartedAt: null,
        beginGesture: () => set({ gestureStartedAt: Date.now() }),
        endGesture: () => set({ gestureStartedAt: null }),

        loadForSetup: async (setupId) => {
          store.temporal.getState().clear();
          const fresh = {
            selectedCableIds: new Set<number | string>(),
            zoomScale: 1,
            panX: 0,
            panY: 0,
            isDirty: false,
          };
          if (!setupId) {
            set({ cables: [], ...fresh });
            return;
          }
          const cables = await window.api.patchbay.listCables(setupId);
          set({ cables, ...fresh });
          store.temporal.getState().clear();
        },

        addCable: (cable) => {
          const id = crypto.randomUUID();
          const zIndex =
            get().cables.reduce((max, c) => Math.max(max, c.zIndex), 0) + 1;
          set({
            cables: [...get().cables, { ...cable, id, zIndex }],
            selectedCableIds: new Set([id]),
            isDirty: true,
          });
          return id;
        },

        updateCable: (id, patch) =>
          set({
            cables: get().cables.map((c) =>
              c.id === id ? { ...c, ...patch } : c,
            ),
            isDirty: true,
          }),

        updateCables: (ids, patch) => {
          const targets = new Set(ids);
          set({
            cables: get().cables.map((c) =>
              targets.has(c.id) ? { ...c, ...patch } : c,
            ),
            isDirty: true,
          });
        },

        removeCables: (ids) => {
          if (ids.length === 0) return;
          const targets = new Set(ids);
          const selected = new Set(
            [...get().selectedCableIds].filter((id) => !targets.has(id)),
          );
          set({
            cables: get().cables.filter((c) => !targets.has(c.id)),
            selectedCableIds: selected,
            isDirty: true,
          });
        },

        selectCable: (id, additive) => {
          if (!additive) {
            set({ selectedCableIds: new Set([id]) });
            return;
          }
          const next = new Set(get().selectedCableIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          set({ selectedCableIds: next });
        },

        selectCables: (ids, additive) =>
          set({
            selectedCableIds: additive
              ? new Set([...get().selectedCableIds, ...ids])
              : new Set(ids),
          }),

        clearSelection: () => set({ selectedCableIds: new Set() }),

        setZoomPan: (zoomScale, panX, panY) =>
          set({
            zoomScale: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomScale)),
            panX,
            panY,
          }),
        zoomIn: () =>
          set((s) => ({
            zoomScale: Math.min(MAX_ZOOM, s.zoomScale * KEYBOARD_ZOOM_STEP),
          })),
        zoomOut: () =>
          set((s) => ({
            zoomScale: Math.max(MIN_ZOOM, s.zoomScale / KEYBOARD_ZOOM_STEP),
          })),
        resetView: () => set({ zoomScale: 1, panX: 0, panY: 0 }),

        save: async () => {
          const setupId = setupStoreApi.getState().setupId;
          if (!setupId) return;
          const startedAt = get().gestureStartedAt;
          if (startedAt != null) {
            if (Date.now() - startedAt < GESTURE_MAX_MS) return;
            set({ gestureStartedAt: null });
          }
          const sent = get().cables;
          set({ isSaving: true });
          try {
            const { idMap } = await window.api.patchbay.saveCables(
              setupId,
              sent.map((c) => ({ ...c })),
            );
            // Keep the live array (see layoutStore.save for why adopting the saved copy would
            // record an undo step), swapping only the ids the save assigned.
            const remap = (
              cables: PatchbayCableDraft[],
            ): PatchbayCableDraft[] =>
              cables.map((c) =>
                idMap[String(c.id)] != null
                  ? { ...c, id: idMap[String(c.id)] }
                  : c,
              );
            const hasRemap = Object.keys(idMap).length > 0;
            const current = get().cables;
            const next = hasRemap ? remap(current) : current;
            const ids = new Set(next.map((c) => c.id));
            const selectedCableIds = new Set<number | string>();
            for (const id of get().selectedCableIds) {
              const mapped = idMap[String(id)] ?? id;
              if (ids.has(mapped)) selectedCableIds.add(mapped);
            }
            const temporalApi = store.temporal;
            if (hasRemap) {
              const remapSnapshot = (
                snap: Partial<PatchbayState>,
              ): Partial<PatchbayState> =>
                snap.cables ? { ...snap, cables: remap(snap.cables) } : snap;
              temporalApi.setState((t) => ({
                pastStates: t.pastStates.map(remapSnapshot),
                futureStates: t.futureStates.map(remapSnapshot),
              }));
            }
            temporalApi.getState().pause();
            try {
              set({
                cables: next,
                selectedCableIds,
                isDirty: current !== sent,
                isSaving: false,
                saveError: null,
              });
            } finally {
              temporalApi.getState().resume();
            }
          } catch (err) {
            set({
              isSaving: false,
              saveError: {
                message: err instanceof Error ? err.message : String(err),
                at: Date.now(),
              },
            });
          }
        },
      }),
      {
        partialize: (state) => ({ cables: state.cables }),
        // Snapshot only real edits — cables are replaced immutably on every change, while
        // selection, zoom and pan updates leave the array as it was.
        equality: (past, current) => past.cables === current.cables,
        limit: 100,
      },
    ),
  );
  return store;
}

/** The app-wide instance, paired with the default setupStore — Split View's second pane gets its
 *  own (see SplitSetupView.tsx). */
export const usePatchbayStore = createPatchbayStore(useSetupStore);
