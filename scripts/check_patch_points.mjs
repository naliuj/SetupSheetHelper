// Runs jack detection over every bundled patchbay drawing and checks each studio still finds about
// as many jacks as it did when the counts below were recorded. A change to detectPatchPoints.ts
// that quietly loses (or invents) a few hundred jacks on one drawing fails here instead of in a
// session. Run with `npm run check:patchpoints`; exits non-zero on any failure.
//
// It calls the app's own readPatchbayPdf, so text extraction and filled-box reading are exactly the
// app's. That file imports through the '@shared' alias, which only Vite understands, so it and the
// one file it imports are copied to a temp folder with the specifiers rewritten.
//
// shortcut: the tolerance is a flat ±3% of the recorded count; tighten it per studio if a real
// regression ever slips under it.

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/** Jacks found per drawing, measured 2026-11-05 with PATCH_POINTS_VERSION 1. Re-measure (the
 *  script prints the actual counts) and update these deliberately when detection is meant to change. */
const EXPECTED = {
  studio_1: 1318,
  studio_2: 1176,
  studio_3: 873,
  studio_a: 984,
  studio_b: 960,
  studio_e: 915
}
const TOLERANCE = 0.03

const temp = mkdtempSync(join(tmpdir(), 'check-patch-points-'))
let failed = false
try {
  const pdfjs = import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs')
  writeFileSync(join(temp, 'patchbay.mts'), readFileSync(join(root, 'src/shared/types/patchbay.ts'), 'utf8'))
  const detector = readFileSync(join(root, 'src/main/pdf/detectPatchPoints.ts'), 'utf8')
    .replace("'@shared/types/patchbay'", "'./patchbay.mts'")
    .replace("'pdfjs-dist/legacy/build/pdf.mjs'", JSON.stringify(pdfjs))
  writeFileSync(join(temp, 'detectPatchPoints.mts'), detector)
  const { readPatchbayPdf } = await import(pathToFileURL(join(temp, 'detectPatchPoints.mts')).href)

  const dir = join(root, 'resources/patchbays')
  const studios = readdirSync(dir)
    .filter((name) => name.endsWith('.pdf'))
    .map((name) => basename(name, '.pdf'))
  for (const studio of Object.keys(EXPECTED)) {
    if (!studios.includes(studio)) {
      console.error(`FAIL ${studio}: resources/patchbays/${studio}.pdf is missing`)
      failed = true
    }
  }

  for (const studio of studios) {
    const { points } = await readPatchbayPdf(join(dir, `${studio}.pdf`))
    const expected = EXPECTED[studio]
    if (expected === undefined) {
      console.error(`FAIL ${studio}: ${points.length} jacks, but no expected count is recorded for it`)
      failed = true
      continue
    }
    const ok = Math.abs(points.length - expected) <= expected * TOLERANCE
    if (!ok) failed = true
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${studio}: ${points.length} jacks (expected ${expected} ±${TOLERANCE * 100}%)`)
  }
} finally {
  rmSync(temp, { recursive: true, force: true })
}

process.exit(failed ? 1 : 0)
