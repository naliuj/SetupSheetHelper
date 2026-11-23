import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { dialog } from "electron";
import { writeFileSync } from "node:fs";
import type {
  ExportChangeoverPdfInput,
  ExportSetupPdfResult,
} from "@shared/types/ipc";
import type { SetupItem } from "@shared/types/setup";
import {
  bandChanges,
  bandRanges,
  describeBandChanges,
  type GearNames,
} from "@shared/utils/bands";
import { getSetupWithItems } from "../db/repositories/setupsRepo";
import {
  resolveMicText,
  resolveOutboardSlotText,
  resolvePreampText,
} from "../db/resolveGearLabels";
import { exportFileName, loadSetupGear } from "../db/exportShared";
import { sanitizeForWinAnsi, wrapText } from "./pdfLayout";

export type ChangeoverLineKind = "title" | "subtitle" | "heading" | "body";

export interface ChangeoverLine {
  kind: ChangeoverLineKind;
  text: string;
}

/** The changeover page as lines, unsanitized: title, setup name, "Band A → Band B (7:00 pm)",
 *  then the Re-patch / Add / Remove sections (empty ones left out). Throws if `bandIndex` is not a
 *  band after the first. */
export function changeoverLines(
  setup: { name: string; items: SetupItem[] },
  bandIndex: number,
  names: GearNames<SetupItem>,
): { bandName: string; lines: ChangeoverLine[] } {
  const ranges = bandRanges(setup.items);
  if (
    !Number.isInteger(bandIndex) ||
    bandIndex < 1 ||
    bandIndex >= ranges.length
  ) {
    throw new Error(
      `Can't print a changeover for band ${bandIndex + 1}: this setup has ${ranges.length} band(s), and the first band has no band before it.`,
    );
  }
  const bandName = (index: number): string =>
    ranges[index].divider?.sourceName.trim() || `Band ${index + 1}`;
  const rows = (index: number): SetupItem[] =>
    setup.items.slice(ranges[index].start, ranges[index].end);

  const previous = bandName(bandIndex - 1);
  const current = bandName(bandIndex);
  const startTime = ranges[bandIndex].divider?.startTime?.trim();
  const { changed, added, removed } = describeBandChanges(
    bandChanges(rows(bandIndex - 1), rows(bandIndex)),
    names,
  );

  const lines: ChangeoverLine[] = [
    { kind: "title", text: "Changeover" },
    { kind: "subtitle", text: setup.name },
    {
      kind: "subtitle",
      text: `${previous} → ${current}${startTime ? ` (${startTime})` : ""}`,
    },
  ];
  const sections: Array<[string, string[]]> = [
    ["Re-patch", changed],
    ["Add", added],
    ["Remove", removed],
  ];
  for (const [heading, body] of sections) {
    if (body.length === 0) continue;
    lines.push({ kind: "heading", text: heading });
    for (const text of body) lines.push({ kind: "body", text });
  }
  if (lines.length === 3)
    lines.push({ kind: "body", text: `No changes from ${previous}.` });
  return { bandName: current, lines };
}

// US Letter portrait, points.
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const STYLE: Record<
  ChangeoverLineKind,
  { size: number; bold: boolean; before: number }
> = {
  title: { size: 20, bold: true, before: 0 },
  subtitle: { size: 12, bold: false, before: 4 },
  heading: { size: 13, bold: true, before: 16 },
  body: { size: 11, bold: false, before: 4 },
};
const BODY_INDENT = 12;

/** The page's PDF bytes. Every line goes through sanitizeForWinAnsi, which turns the "→" in the
 *  band line and in "mic KM184 → SM81" into "->" (Helvetica's WinAnsi encoding has no arrow).
 *  Long lines wrap; a long list runs onto further pages. */
export async function buildChangeoverPdf(
  lines: ChangeoverLine[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  for (const line of lines) {
    const style = STYLE[line.kind];
    const lineFont = style.bold ? boldFont : font;
    const x = MARGIN + (line.kind === "body" ? BODY_INDENT : 0);
    const wrapped = wrapText(
      sanitizeForWinAnsi(line.text),
      lineFont,
      style.size,
      PAGE_WIDTH - MARGIN - x,
    );
    y -= style.before;
    wrapped.forEach((text, i) => {
      const lineHeight = style.size * 1.25;
      if (y - lineHeight < MARGIN) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      y -= lineHeight;
      // Continuation lines of a wrapped body line hang under its text, not its start.
      page.drawText(text, {
        x: x + (i > 0 && line.kind === "body" ? BODY_INDENT : 0),
        y,
        size: style.size,
        font: lineFont,
        color: rgb(0, 0, 0),
      });
    });
  }
  return pdfDoc.save();
}

/** The printable changeover list between one band and the band before it: what to re-patch,
 *  add and remove at the break. Lines come from describeBandChanges in shared/utils/bands.ts, so
 *  they read exactly like the editor's changeover panel. */
export async function exportChangeoverPdf(
  input: ExportChangeoverPdfInput,
): Promise<ExportSetupPdfResult> {
  const setup = getSetupWithItems(input.setupId);
  if (!setup) return { canceled: true };

  const { micById, preampById, outboardById } = loadSetupGear(setup.items);
  const names: GearNames<SetupItem> = {
    mic: (item) => resolveMicText(item, micById),
    preamp: (item) => resolvePreampText(item, preampById),
    // Every filled slot, not just the visible outboard columns: bandChanges compares them all.
    outboards: (item) =>
      [...item.outboards]
        .sort((a, b) => a.slotIndex - b.slotIndex)
        .map((slot) => resolveOutboardSlotText(slot, outboardById).trim())
        .filter(Boolean)
        .join(", "),
  };
  const { bandName, lines } = changeoverLines(setup, input.bandIndex, names);
  const pdfBytes = await buildChangeoverPdf(lines);

  const saveResult = await dialog.showSaveDialog({
    title: "Print Changeover",
    defaultPath: `${exportFileName(`${setup.name} - Changeover to ${bandName}`)}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return { canceled: true };

  writeFileSync(saveResult.filePath, pdfBytes);
  return { canceled: false, filePath: saveResult.filePath };
}
