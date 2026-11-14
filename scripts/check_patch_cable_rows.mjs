// Checks the exported cable list's ordering (buildPatchCableRows): a cable reads from its top/left
// end whichever end was dragged first, so A1→G1 and G2→A2 list together as A1 → G1, A2 → G2.
// Run with `node scripts/check_patch_cable_rows.mjs`; exits non-zero on any failure.
//
// The module is TypeScript with extensionless imports, so esbuild bundles it to a temp file first.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildSync } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'patch-cable-rows-'))
const out = join(dir, 'patchCableRows.mjs')
buildSync({ entryPoints: [join(root, 'src/shared/utils/patchCableRows.ts')], bundle: true, format: 'esm', outfile: out, logLevel: 'error' })
const { buildPatchCableRows } = await import(pathToFileURL(out).href)
rmSync(dir, { recursive: true, force: true })

// Two strips: row A at y=100 and row G at y=400, jacks 40px apart.
const jack = (row, n, y) => ({ id: `${row}${n}`, label: `${row}${n}`, section: `ROW ${row}`, x: n * 40, y })
const points = [1, 2, 3].flatMap((n) => [jack('A', n, 100), jack('G', n, 400)])
const at = (id) => points.find((p) => p.id === id)
const cable = (from, to) => ({
  fromX: at(from).x, fromY: at(from).y, fromPoint: from,
  toX: at(to).x, toY: at(to).y, toPoint: to,
  color: '#ff0000'
})
const freeEnd = (to) => ({ fromX: 900, fromY: 900, fromPoint: null, toX: at(to).x, toY: at(to).y, toPoint: to, color: '#ff0000' })

let failures = 0
function check(name, cables, expected) {
  const got = buildPatchCableRows(cables, points).map((r) => `${r.from} → ${r.to}`)
  const ok = JSON.stringify(got) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(got)}`}`)
}

check('bottom-to-top drag lists from the top end', [cable('A1', 'G1'), cable('G2', 'A2')], [
  'A1 → G1 (ROW G)',
  'A2 → G2 (ROW G)'
])
check('same-row cable lists from its left end', [cable('A3', 'A1')], ['A1 → A3'])
check('a free end goes second, after the jack end', [freeEnd('G3')], ['G3 → Unlabeled point'])
check('top-to-bottom drags are unchanged', [cable('A2', 'G2'), cable('A1', 'G1')], [
  'A1 → G1 (ROW G)',
  'A2 → G2 (ROW G)'
])

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
