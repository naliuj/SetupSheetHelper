import { create } from "zustand";
import { APP_SETTINGS_KEYS } from "@shared/types/entities";
import {
  CABLE_COLORS,
  DEFAULT_CABLE_COLOR,
  DEFAULT_CABLE_SAG,
} from "@shared/constants/patchCables";

interface PatchbayPrefsState {
  color: string;
  sag: number;
  load(): Promise<void>;
  set(patch: Partial<Pick<PatchbayPrefsState, "color" | "sag">>): void;
}

/** The color and sag the next cable is drawn with — whatever was last picked, remembered across
 *  launches like the markup toolbar's pen. */
export const usePatchbayPrefsStore = create<PatchbayPrefsState>((set, get) => ({
  color: DEFAULT_CABLE_COLOR,
  sag: DEFAULT_CABLE_SAG,

  load: async () => {
    try {
      const raw = await window.api.settings.get(
        APP_SETTINGS_KEYS.patchbayPrefs,
      );
      const saved = raw ? (JSON.parse(raw) as Partial<PatchbayPrefsState>) : {};
      set({
        color: CABLE_COLORS.some((c) => c.hex === saved.color)
          ? (saved.color as string)
          : DEFAULT_CABLE_COLOR,
        sag:
          typeof saved.sag === "number" && saved.sag >= 0 && saved.sag <= 1
            ? saved.sag
            : DEFAULT_CABLE_SAG,
      });
    } catch {
      // Unreadable setting: keep the defaults.
    }
  },

  set: (patch) => {
    set(patch);
    const { color, sag } = get();
    void window.api.settings.set(
      APP_SETTINGS_KEYS.patchbayPrefs,
      JSON.stringify({ color, sag }),
    );
  },
}));
