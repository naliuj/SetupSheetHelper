import type Database from "better-sqlite3";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getBundledPatchbaysDir, getPatchbaysDir } from "../userDataPaths";

/** Patchbay PDFs bundled with the app (resources/patchbays, see package.json's extraResources) —
 *  Berklee's 2025 patchbay drawings, one per studio. None for Studio A76 (not available yet).
 *  Page sizes are recorded here because the seed and migration 048 attach them inside synchronous
 *  transactions, where the PDF can't be parsed. */
export const BUNDLED_PATCHBAYS: {
  buildingName: string;
  studioName: string;
  file: string;
  widthPt: number;
  heightPt: number;
}[] = [
  {
    buildingName: "160",
    studioName: "Studio 1",
    file: "studio_1.pdf",
    widthPt: 2592,
    heightPt: 1296,
  },
  {
    buildingName: "160",
    studioName: "Studio 2",
    file: "studio_2.pdf",
    widthPt: 864,
    heightPt: 1296,
  },
  {
    buildingName: "160",
    studioName: "Studio 3",
    file: "studio_3.pdf",
    widthPt: 792,
    heightPt: 612,
  },
  {
    buildingName: "150",
    studioName: "Studio A",
    file: "studio_a.pdf",
    widthPt: 792,
    heightPt: 1224,
  },
  {
    buildingName: "150",
    studioName: "Studio B",
    file: "studio_b.pdf",
    widthPt: 792,
    heightPt: 1224,
  },
  {
    buildingName: "150",
    studioName: "Studio E",
    file: "studio_e.pdf",
    widthPt: 792,
    heightPt: 1224,
  },
];

/** Gives each Berklee studio that exists and has no patchbay yet its bundled drawing. Used by the
 *  Berklee seed (new installs) and migration 048 (installs seeded before patchbays existed), so a
 *  patchbay a user uploaded themselves is never replaced. Detected jacks are left for the first
 *  load to fill in (patchbay_files.points_json NULL). */
export function attachBundledPatchbays(db: Database.Database): void {
  const findStudio = db.prepare(`
    SELECT studios.id AS id FROM studios
    JOIN buildings ON buildings.id = studios.building_id
    WHERE buildings.name = ? AND studios.name = ?
  `);
  const hasPatchbay = db.prepare(
    "SELECT 1 FROM patchbay_files WHERE studio_id = ?",
  );
  const insert = db.prepare(
    `INSERT INTO patchbay_files (studio_id, file_path, original_name, page_width_pt, page_height_pt)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const bundledDir = getBundledPatchbaysDir();
  for (const patchbay of BUNDLED_PATCHBAYS) {
    const studio = findStudio.get(
      patchbay.buildingName,
      patchbay.studioName,
    ) as { id: number } | undefined;
    if (!studio || hasPatchbay.get(studio.id)) continue;
    const sourcePath = join(bundledDir, patchbay.file);
    if (!existsSync(sourcePath)) continue; // a missing bundled asset shouldn't break the caller
    const destPath = join(getPatchbaysDir(), `studio_${studio.id}.pdf`);
    copyFileSync(sourcePath, destPath);
    insert.run(
      studio.id,
      destPath,
      patchbay.file,
      patchbay.widthPt,
      patchbay.heightPt,
    );
  }
}
