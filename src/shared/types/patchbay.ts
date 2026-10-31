/** A jack found on a studio's patchbay drawing. Patchbay PDFs don't draw jacks as shapes — each
 *  one is a labeled column in a strip (a number, "L"/"R", "IN 1", "PB-12"), so a point sits on its
 *  label. Coordinates are room pixels: 2× PDF points, origin top-left, matching how the drawing is
 *  rendered (see PATCHBAY_RENDER_SCALE). */
export interface PatchPoint {
  /** Stable within one detection run: `<row index>:<column index>`. Stored on cables, so a cable
   *  can still name its jacks; a re-detection that shifts ids just loses the names, not the cable. */
  id: string;
  /** Short display name, e.g. "B12", or "BB · L" when the jack's own label isn't a number. */
  label: string;
  /** The strip heading above the jack ("MIC TIE LINE OUT"), when one could be read. */
  section: string | null;
  x: number;
  y: number;
}

/** A studio's patchbay drawing — one PDF per studio, like the room layout. */
export interface PatchbayFile {
  id: number;
  studioId: number;
  filePath: string;
  originalName: string | null;
  pageWidthPt: number;
  pageHeightPt: number;
  importedAt: string;
}

/** What Patchbay Mode loads: the file plus the jacks found on it (empty when none could be read,
 *  in which case cables are placed freely). */
export interface PatchbayWithPoints {
  file: PatchbayFile;
  points: PatchPoint[];
}

/** One patch cable on a setup's patchbay. Ends are room-pixel positions; `fromPoint`/`toPoint` name
 *  the jacks they snapped to, or null for a freely placed end. */
export interface PatchbayCable {
  id: number;
  setupId: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  fromPoint: string | null;
  toPoint: string | null;
  color: string;
  /** 0 (taut) to 1 (heavy droop). */
  sag: number;
  zIndex: number;
}

/** A cable as the editor holds it: new cables carry a client-side string id until saved. */
export type PatchbayCableDraft = Omit<PatchbayCable, "id" | "setupId"> & {
  id: number | string;
};

/** PDF points → room pixels. Same factor the room layout uses for PDFs (144 px/in). */
export const PATCHBAY_RENDER_SCALE = 2;

/** What `patchbay.saveCables` returns: the saved list plus which row id each newly inserted cable
 *  became, keyed by the id the renderer sent (same contract as SaveLayoutBlocksResult). */
export interface SavePatchbayCablesResult {
  cables: PatchbayCable[];
  idMap: Record<string, number>;
}

/** A PDF the user picked for a studio's patchbay, not yet copied in. */
export interface PickedPatchbayFile {
  sourcePath: string;
  fileName: string;
}
