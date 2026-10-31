import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Image as KonvaImage, Layer, Rect, Stage } from "react-konva";
import type Konva from "konva";
import type { PatchbayWithPoints, PatchPoint } from "@shared/types/patchbay";
import { CABLE_COLORS, cableColorName } from "@shared/constants/patchCables";
import { MAX_ZOOM, MIN_ZOOM } from "@renderer/state/layoutStore";
import { usePatchbayStoreState } from "@renderer/state/patchbayStoreContext";
import { usePatchbayPrefsStore } from "@renderer/state/patchbayPrefsStore";
import { useThemeColor } from "@renderer/hooks/useThemeColor";
import Icon from "@renderer/components/Icon";
import { PAPER_SHADOW } from "../canvas/LayoutBackground";
import { appFileUrl, renderPdfPage } from "../canvas/renderPdfPage";
import PatchbayCable from "./PatchbayCable";
import { cableIntersectsRect, PointIndex, type Pt } from "./cableGeometry";

interface Props {
  studioId: number;
  stageRef: React.RefObject<Konva.Stage | null>;
  /** Whether Patchbay Mode is the visible mode — the stage stays mounted while hidden. */
  active: boolean;
  /** False for the inactive pane of Split View. */
  paneActive: boolean;
}

/** One end of a cable: where it is, and the jack it snapped to (null when placed freely). */
interface CableEnd extends Pt {
  point: string | null;
}

/** A cable being drawn. Pressing on a jack and dragging draws it ('drag'); a press that doesn't
 *  move leaves it following the pointer until the next click ('click'). */
interface Draft {
  from: CableEnd;
  to: CableEnd;
  mode: "drag" | "click";
  startClient: Pt;
}

const ZOOM_STEP = 1.05;
/** How far the pointer has to travel (screen pixels) before a press counts as a drag. */
const DRAG_THRESHOLD = 4;

/** Patchbay Mode's canvas: the studio's patchbay drawing, with patch cables drawn between its
 *  jacks. Jacks come from the drawing's own text (see detectPatchPoints.ts) and cable ends snap to
 *  them; a drawing with none readable still takes cables, placed freely. View handling (fit,
 *  scroll to zoom toward the cursor, Space-drag to pan) matches Layout Mode's. */
export default function PatchbayStage({
  studioId,
  stageRef,
  active,
  paneActive,
}: Props): JSX.Element {
  const cables = usePatchbayStoreState((s) => s.cables);
  const selectedCableIds = usePatchbayStoreState((s) => s.selectedCableIds);
  const zoomScale = usePatchbayStoreState((s) => s.zoomScale);
  const panX = usePatchbayStoreState((s) => s.panX);
  const panY = usePatchbayStoreState((s) => s.panY);
  const setZoomPan = usePatchbayStoreState((s) => s.setZoomPan);
  const zoomIn = usePatchbayStoreState((s) => s.zoomIn);
  const zoomOut = usePatchbayStoreState((s) => s.zoomOut);
  const resetView = usePatchbayStoreState((s) => s.resetView);
  const addCable = usePatchbayStoreState((s) => s.addCable);
  const updateCable = usePatchbayStoreState((s) => s.updateCable);
  const updateCables = usePatchbayStoreState((s) => s.updateCables);
  const removeCables = usePatchbayStoreState((s) => s.removeCables);
  const selectCable = usePatchbayStoreState((s) => s.selectCable);
  const selectCables = usePatchbayStoreState((s) => s.selectCables);
  const clearSelection = usePatchbayStoreState((s) => s.clearSelection);

  const prefColor = usePatchbayPrefsStore((s) => s.color);
  const prefSag = usePatchbayPrefsStore((s) => s.sag);
  const setPrefs = usePatchbayPrefsStore((s) => s.set);
  const loadPrefs = usePatchbayPrefsStore((s) => s.load);
  useEffect(() => void loadPrefs(), [loadPrefs]);

  const accent = useThemeColor("--color-accent");
  // A translucent wash with a solid edge, as Layout Mode's marquee: the alpha goes on the fill
  // color itself so the stroke stays at full strength.
  const marqueeFill = /^#[0-9a-fA-F]{6}$/.test(accent) ? `${accent}2e` : accent;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({
    width: 900,
    height: 650,
  });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- The drawing and its jacks ----------------------------------------------------------------
  const [patchbay, setPatchbay] = useState<PatchbayWithPoints | null | "none">(
    null,
  );
  const [image, setImage] = useState<{
    source: HTMLCanvasElement;
    width: number;
    height: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [changedCount, setChangedCount] = useState(0);
  useEffect(
    () => window.api.patchbay.onChanged(() => setChangedCount((n) => n + 1)),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setPatchbay(null);
    async function load(): Promise<void> {
      const result = await window.api.patchbay.getForStudio(studioId);
      if (cancelled) return;
      if (!result) {
        setPatchbay("none");
        return;
      }
      const rendered = await renderPdfPage(appFileUrl(result.file.filePath));
      if (cancelled) return;
      setPatchbay(result);
      setImage({
        source: rendered.image,
        width: rendered.width,
        height: rendered.height,
      });
    }
    load().catch((err) => {
      console.error("Failed to load the patchbay", err);
      if (!cancelled) setPatchbay("none");
    });
    return () => {
      cancelled = true;
    };
  }, [studioId, changedCount]);

  const points = patchbay && patchbay !== "none" ? patchbay.points : [];
  const index = useMemo(() => new PointIndex(points), [points]);
  // Cable weight follows the drawing's jack spacing, so cables look right on a dense bay and a
  // roomy one alike.
  const weight = Math.max(2.5, Math.min(7, index.radius * 0.35));
  const pointLabel = (id: string | null): string =>
    index.byId(id)?.label ?? "unlabeled point";

  async function upload(): Promise<void> {
    setUploading(true);
    try {
      await window.api.patchbay.importForStudio(studioId);
    } catch (err) {
      console.error("Failed to import the patchbay", err);
    } finally {
      setUploading(false);
    }
  }

  // --- View: fit to the container, then the user's zoom and pan on top ---------------------------
  const imageSize = image ?? { width: 1584, height: 1224 };
  const fitScale =
    Math.min(
      containerSize.width / imageSize.width,
      containerSize.height / imageSize.height,
    ) || 1;
  const offsetX = (containerSize.width - imageSize.width * fitScale) / 2;
  const offsetY = (containerSize.height - imageSize.height * fitScale) / 2;
  const finalScale = fitScale * zoomScale;
  const finalX = offsetX + panX;
  const finalY = offsetY + panY;

  function toCanvas(clientX: number, clientY: number): Pt | null {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: (clientX - rect.left - finalX) / finalScale,
      y: (clientY - rect.top - finalY) / finalScale,
    };
  }

  /** Where a cable end lands for a pointer position: on the nearest jack, or right there when no
   *  jack is in reach. */
  function endAt(pos: Pt): CableEnd {
    const jack = index.nearest(pos);
    return jack
      ? { x: jack.x, y: jack.y, point: jack.id }
      : { ...pos, point: null };
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>): void {
    e.evt.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursorX = e.evt.clientX - rect.left;
    const cursorY = e.evt.clientY - rect.top;
    const contentX = (cursorX - finalX) / finalScale;
    const contentY = (cursorY - finalY) / finalScale;
    // A pinch arrives as a ctrlKey wheel with a small delta per frame; follow it smoothly.
    const pinch = e.evt.ctrlKey;
    const delta = Math.max(-25, Math.min(25, e.evt.deltaY));
    const factor = pinch
      ? Math.exp(-delta * 0.01)
      : e.evt.deltaY < 0
        ? ZOOM_STEP
        : 1 / ZOOM_STEP;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomScale * factor));
    const nextScale = fitScale * nextZoom;
    setZoomPan(
      nextZoom,
      cursorX - contentX * nextScale - offsetX,
      cursorY - contentY * nextScale - offsetY,
    );
  }

  // --- Pointer interaction ------------------------------------------------------------------------
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [pan, setPan] = useState<{ client: Pt; start: Pt } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Re-patching an end previews here and writes to the store once, on release, so the move is a
  // single undo step rather than one per mouse move.
  const [endDrag, setEndDrag] = useState<{
    id: number | string;
    end: "from" | "to";
    at: CableEnd | null;
  } | null>(null);
  const [hoverJack, setHoverJack] = useState<PatchPoint | null>(null);
  const [hoverCable, setHoverCable] = useState<number | string | null>(null);
  const [pointer, setPointer] = useState<Pt | null>(null);
  // Drag-to-select on empty canvas. `start`/`at` are canvas coordinates for drawing and hit
  // testing; `startClient` measures the drag in screen pixels, so a slight wobble on a plain click
  // doesn't count at any zoom. `shiftStarted` marks a marquee that Shift had to start (a drawing
  // with no jacks, where a bare press starts a cable), so Shift then doesn't also mean "add".
  const [marquee, setMarquee] = useState<{
    start: Pt;
    at: Pt;
    startClient: Pt;
    shiftStarted: boolean;
  } | null>(null);

  function finishDraft(d: Draft): void {
    setDraft(null);
    const sameJack = d.from.point != null && d.from.point === d.to.point;
    if (
      sameJack ||
      Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) < index.radius
    )
      return;
    addCable({
      fromX: d.from.x,
      fromY: d.from.y,
      toX: d.to.x,
      toY: d.to.y,
      fromPoint: d.from.point,
      toPoint: d.to.point,
      color: prefColor,
      sag: prefSag,
    });
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (e.evt.button !== 0) return;
    if (spaceHeld) {
      setPan({
        client: { x: e.evt.clientX, y: e.evt.clientY },
        start: { x: panX, y: panY },
      });
      return;
    }
    const pos = toCanvas(e.evt.clientX, e.evt.clientY);
    if (!pos) return;
    if (draft?.mode === "click") {
      finishDraft({ ...draft, to: endAt(pos) });
      return;
    }
    const name = e.target.name();
    if (name === "cable-end") return; // handled by the handle itself
    if (name === "cable") return; // handled by the cable itself
    // A press on a jack starts a cable. Anywhere else starts a selection marquee (a press that
    // doesn't move just clears the selection) — unless the drawing has no readable jacks, where
    // cables start wherever you press and only Shift starts a marquee.
    const jack = index.nearest(pos);
    const noJacks = points.length === 0;
    if ((!jack && !noJacks) || (noJacks && e.evt.shiftKey)) {
      setMarquee({
        start: pos,
        at: pos,
        startClient: { x: e.evt.clientX, y: e.evt.clientY },
        shiftStarted: noJacks,
      });
      return;
    }
    const from = endAt(pos);
    setDraft({
      from,
      to: from,
      mode: "drag",
      startClient: { x: e.evt.clientX, y: e.evt.clientY },
    });
  }

  function handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (pan) {
      setZoomPan(
        zoomScale,
        pan.start.x + e.evt.clientX - pan.client.x,
        pan.start.y + e.evt.clientY - pan.client.y,
      );
      return;
    }
    const pos = toCanvas(e.evt.clientX, e.evt.clientY);
    if (!pos) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect)
      setPointer({ x: e.evt.clientX - rect.left, y: e.evt.clientY - rect.top });
    if (marquee) {
      setMarquee({ ...marquee, at: pos });
      return;
    }
    const jack = index.nearest(pos);
    setHoverJack(jack);
    if (draft) {
      setDraft({ ...draft, to: endAt(pos) });
      return;
    }
    if (endDrag) setEndDrag({ ...endDrag, at: endAt(pos) });
  }

  function commitEndDrag(): void {
    if (!endDrag) return;
    setEndDrag(null);
    const end = endDrag.at;
    if (!end) return;
    updateCable(
      endDrag.id,
      endDrag.end === "from"
        ? { fromX: end.x, fromY: end.y, fromPoint: end.point }
        : { toX: end.x, toY: end.y, toPoint: end.point },
    );
  }

  /** Ends a marquee: selects every cable whose curve passes through it, or — for a press that
   *  barely moved — clears the selection, as a plain click on empty canvas always has. */
  function finishMarquee(e: MouseEvent, m: NonNullable<typeof marquee>): void {
    setMarquee(null);
    const additive =
      e.metaKey || e.ctrlKey || (e.shiftKey && !m.shiftStarted);
    const moved = Math.hypot(
      e.clientX - m.startClient.x,
      e.clientY - m.startClient.y,
    );
    if (moved < DRAG_THRESHOLD) {
      if (!additive) clearSelection();
      return;
    }
    const rect = {
      left: Math.min(m.start.x, m.at.x),
      right: Math.max(m.start.x, m.at.x),
      top: Math.min(m.start.y, m.at.y),
      bottom: Math.max(m.start.y, m.at.y),
    };
    selectCables(
      cables
        .filter((c) =>
          cableIntersectsRect(
            { x: c.fromX, y: c.fromY },
            { x: c.toX, y: c.toY },
            c.sag,
            rect,
          ),
        )
        .map((c) => c.id),
      additive,
    );
  }

  function handleMouseUp(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (pan) {
      setPan(null);
      return;
    }
    if (marquee) {
      finishMarquee(e.evt, marquee);
      return;
    }
    if (endDrag) {
      commitEndDrag();
      return;
    }
    if (draft?.mode === "drag") {
      const moved = Math.hypot(
        e.evt.clientX - draft.startClient.x,
        e.evt.clientY - draft.startClient.y,
      );
      if (moved < DRAG_THRESHOLD) setDraft({ ...draft, mode: "click" });
      else {
        const pos = toCanvas(e.evt.clientX, e.evt.clientY);
        finishDraft(pos ? { ...draft, to: endAt(pos) } : draft);
      }
    }
  }

  // Space to pan and Escape to drop a cable mid-draw: fixed canvas conventions, as in Layout Mode.
  // Gated on `active` — the stage stays mounted while hidden, and a hidden stage must not swallow
  // Space for the rest of the app.
  useEffect(() => {
    const isTextField = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null;
      return (
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      );
    };
    function onKeyDown(e: KeyboardEvent): void {
      if (!active || !paneActive || isTextField(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpaceHeld(true);
      } else if (e.key === "Escape" && draft) {
        setDraft(null);
      }
    }
    function onKeyUp(e: KeyboardEvent): void {
      if (e.code === "Space") {
        setSpaceHeld(false);
        setPan(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [active, paneActive, draft]);

  // Leaving the mode drops a half-drawn cable rather than leaving it stuck to the pointer.
  useEffect(() => {
    if (!active) setDraft(null);
  }, [active]);

  // --- Toolbar: color and sag apply to the selection, or to the next cable when nothing is selected
  const selected = cables.filter((c) => selectedCableIds.has(c.id));
  const shownColor =
    selected.length > 0
      ? selected.every((c) => c.color === selected[0].color)
        ? selected[0].color
        : null
      : prefColor;
  // A mixed selection shows the average droop, snapped to the slider's step; dragging the slider
  // then sets every selected cable to the same value.
  const shownSag =
    selected.length > 0
      ? Math.round(
          (selected.reduce((sum, c) => sum + c.sag, 0) / selected.length) * 20,
        ) / 20
      : prefSag;
  // The slider previews locally and commits on release, so one drag is one undo step and autosave
  // never writes the values in between. The selected cables (or the cable being drawn) read the
  // preview, so the droop follows the thumb live. The ref mirrors it for the release handlers,
  // which can fire back to back (pointer-up, then blur) before a re-render.
  const [sagPreview, setSagPreview] = useState<number | null>(null);
  const sagPreviewRef = useRef<number | null>(null);
  function previewSag(value: number): void {
    sagPreviewRef.current = value;
    setSagPreview(value);
  }

  function pickColor(hex: string): void {
    if (selected.length > 0)
      updateCables([...selectedCableIds], { color: hex });
    else setPrefs({ color: hex });
  }

  function commitSag(): void {
    const value = sagPreviewRef.current;
    if (value == null) return; // nothing previewed since the last commit
    sagPreviewRef.current = null;
    setSagPreview(null);
    if (selected.length > 0) {
      // Skip a release that changed nothing, so it doesn't leave an empty undo step.
      if (selected.every((c) => c.sag === value)) return;
      updateCables([...selectedCableIds], { sag: value });
    } else setPrefs({ sag: value });
  }

  // The cables as drawn: the stored ones, with the Sag slider's live value on the selected ones
  // and an end being dragged shown where it is now.
  const shownCables = cables.map((stored) => {
    const c =
      sagPreview != null && selectedCableIds.has(stored.id)
        ? { ...stored, sag: sagPreview }
        : stored;
    if (!endDrag?.at || c.id !== endDrag.id) return c;
    const { x, y } = endDrag.at;
    return endDrag.end === "from"
      ? { ...c, fromX: x, fromY: y }
      : { ...c, toX: x, toY: y };
  });

  const hoveredCable =
    hoverCable != null ? cables.find((c) => c.id === hoverCable) : null;
  const tooltip = draft
    ? `${pointLabel(draft.from.point)} → ${draft.to.point ? pointLabel(draft.to.point) : "…"}`
    : hoveredCable
      ? `${pointLabel(hoveredCable.fromPoint)} → ${pointLabel(hoveredCable.toPoint)} · ${cableColorName(hoveredCable.color)}`
      : hoverJack
        ? hoverJack.section
          ? `${hoverJack.label} — ${hoverJack.section}`
          : hoverJack.label
        : null;

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        background: "var(--color-bg)",
        cursor:
          pan || spaceHeld
            ? "grab"
            : draft || hoverJack
              ? "crosshair"
              : undefined,
      }}
    >
      {patchbay === "none" && (
        <div className="patchbay-empty">
          <div className="card" style={{ maxWidth: 420, textAlign: "center" }}>
            <p style={{ marginTop: 0 }}>
              This studio doesn&apos;t have a patchbay drawing yet.
            </p>
            <button
              className="btn primary"
              onClick={() => void upload()}
              disabled={uploading}
            >
              {uploading ? "Importing…" : "Upload patchbay PDF…"}
            </button>
          </div>
        </div>
      )}
      {patchbay !== "none" && (
        <div className="layout-canvas-topbar patchbay-topbar">
          <div
            className="patchbay-cable-controls"
            role="group"
            aria-label={
              selected.length > 0
                ? `${selected.length} selected ${selected.length === 1 ? "cable" : "cables"}`
                : "Next cable"
            }
          >
            <div
              className="patchbay-swatches"
              role="group"
              aria-label="Cable color"
            >
              {CABLE_COLORS.map((c) => (
                <button
                  key={c.hex}
                  className="patchbay-swatch"
                  style={{ background: c.hex }}
                  aria-label={c.name}
                  title={c.name}
                  aria-pressed={shownColor === c.hex}
                  onClick={() => pickColor(c.hex)}
                />
              ))}
            </div>
            <label className="patchbay-sag inline-icon-text">
              Sag
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={sagPreview ?? shownSag}
                onChange={(e) => previewSag(Number(e.target.value))}
                onPointerUp={commitSag}
                onPointerCancel={commitSag}
                onKeyUp={commitSag}
                onBlur={commitSag}
              />
            </label>
            {selected.length > 1 && (
              <span className="patchbay-selection-count">
                {selected.length} cables selected
              </span>
            )}
            {selected.length > 0 && (
              <button
                className="btn small danger"
                onClick={() => removeCables([...selectedCableIds])}
              >
                Delete
              </button>
            )}
          </div>
          <div className="layout-canvas-zoom">
            <button
              className="btn small"
              onClick={zoomOut}
              disabled={zoomScale <= MIN_ZOOM}
              aria-label="Zoom out"
            >
              <Icon name="minus" size={14} />
            </button>
            <span
              style={{
                minWidth: 44,
                textAlign: "center",
                fontSize: 12,
                color: "var(--color-text-dim)",
                userSelect: "none",
              }}
            >
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              className="btn small"
              onClick={zoomIn}
              disabled={zoomScale >= MAX_ZOOM}
              aria-label="Zoom in"
            >
              <Icon name="plus" size={14} />
            </button>
            <button
              className="btn small"
              onClick={resetView}
              style={{ marginLeft: 4 }}
            >
              Reset view
            </button>
          </div>
        </div>
      )}
      <div className="patchbay-hint">
        {draft?.mode === "click"
          ? "Click another jack to connect · Esc to cancel"
          : patchbay && points.length === 0
            ? "No jacks could be read from this drawing — cables can go anywhere · Shift-drag to select"
            : "Drag from jack to jack, or click one then the other · Drag on empty space to select · Scroll to zoom · Space-drag to pan"}
      </div>
      {tooltip && pointer && (
        <div
          className="patchbay-tooltip"
          style={{ left: pointer.x + 14, top: pointer.y + 14 }}
        >
          {tooltip}
        </div>
      )}
      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        scaleX={finalScale}
        scaleY={finalScale}
        x={finalX}
        y={finalY}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setPan(null);
          setHoverJack(null);
          setPointer(null);
          setEndDrag(null);
          setMarquee(null);
          if (draft?.mode === "drag") setDraft(null);
        }}
        onWheel={handleWheel}
      >
        <Layer listening={false}>
          {image && (
            <KonvaImage
              image={image.source}
              width={image.width}
              height={image.height}
              name="patchbay-bg-image"
              {...PAPER_SHADOW}
            />
          )}
          {hoverJack && (
            <Circle
              x={hoverJack.x}
              y={hoverJack.y}
              radius={index.radius * 0.8}
              stroke={accent}
              strokeWidth={2 / finalScale}
            />
          )}
          {draft && draft.to.point && (
            <Circle
              x={draft.to.x}
              y={draft.to.y}
              radius={index.radius * 0.8}
              stroke={accent}
              strokeWidth={3 / finalScale}
            />
          )}
        </Layer>
        <Layer>
          {shownCables.map((cable) => (
            <PatchbayCable
              key={cable.id}
              from={{ x: cable.fromX, y: cable.fromY }}
              to={{ x: cable.toX, y: cable.toY }}
              color={cable.color}
              sag={cable.sag}
              weight={weight}
              selected={selectedCableIds.has(cable.id)}
              accent={accent}
              onMouseDown={(e) => {
                if (spaceHeld || draft) return;
                e.cancelBubble = true;
                selectCable(cable.id, e.evt.metaKey || e.evt.ctrlKey);
              }}
              onMouseEnter={() => setHoverCable(cable.id)}
              onMouseLeave={() =>
                setHoverCable((id) => (id === cable.id ? null : id))
              }
            />
          ))}
          {shownCables
            .filter((c) => selectedCableIds.has(c.id))
            .map((cable) =>
              (["from", "to"] as const).map((end) => (
                <Circle
                  key={`${cable.id}-${end}`}
                  name="cable-end"
                  x={end === "from" ? cable.fromX : cable.toX}
                  y={end === "from" ? cable.fromY : cable.toY}
                  radius={weight * 2}
                  fill="white"
                  stroke={accent}
                  strokeWidth={2 / finalScale}
                  onMouseDown={(e) => {
                    if (spaceHeld) return;
                    e.cancelBubble = true;
                    setEndDrag({ id: cable.id, end, at: null });
                  }}
                />
              )),
            )}
          {draft && (
            <PatchbayCable
              from={draft.from}
              to={draft.to}
              color={prefColor}
              sag={selected.length === 0 ? (sagPreview ?? prefSag) : prefSag}
              weight={weight}
              preview
            />
          )}
          {marquee && (
            <Rect
              x={Math.min(marquee.start.x, marquee.at.x)}
              y={Math.min(marquee.start.y, marquee.at.y)}
              width={Math.abs(marquee.at.x - marquee.start.x)}
              height={Math.abs(marquee.at.y - marquee.start.y)}
              fill={marqueeFill}
              stroke={accent}
              strokeWidth={1 / finalScale}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
