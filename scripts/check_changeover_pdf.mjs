// Checks the printed changeover page (src/main/pdf/exportChangeoverPdf.ts): which lines a band's
// page gets, the "No changes" case, the band-index guard, WinAnsi-safe text, and that the PDF
// builds. Run with `node scripts/check_changeover_pdf.mjs`; exits non-zero on any failure.
//
// esbuild bundles the TypeScript first, with Electron, the SQLite driver and the repositories
// stubbed out (the functions checked here never touch them). pdf-lib stays real.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'changeover-'))
const entry = join(dir, 'entry.ts')
const out = join(dir, 'changeover.mjs')
writeFileSync(
  entry,
  [
    `export { changeoverLines, buildChangeoverPdf } from ${JSON.stringify(join(root, 'src/main/pdf/exportChangeoverPdf.ts'))}`,
    `export { sanitizeForWinAnsi } from ${JSON.stringify(join(root, 'src/main/pdf/pdfLayout.ts'))}`
  ].join('\n')
)
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
  tsconfig: join(root, 'tsconfig.node.json'),
  plugins: [
    {
      name: 'stub-runtime-deps',
      setup(build) {
        build.onResolve({ filter: /^(electron|better-sqlite3)$|\/repositories\/|\/db\/index$/ }, (args) => ({
          path: args.path,
          namespace: 'stub'
        }))
        build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'module.exports = {}', loader: 'js' }))
      }
    }
  ]
})
const { changeoverLines, buildChangeoverPdf, sanitizeForWinAnsi } = await import(pathToFileURL(out).href)
const { PDFDocument } = await import('pdf-lib')
rmSync(dir, { recursive: true, force: true })

let failures = 0
function check(name, got, expected) {
  const g = JSON.stringify(got)
  const e = JSON.stringify(expected)
  const ok = g === e
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${e}\n      got      ${g}`}`)
}

let nextId = 0
const row = (sourceName, over = {}) => ({
  id: ++nextId, setupId: 1, instrumentType: 'custom_source', sourceName, micId: null, micText: null,
  phantomPower: false, channel: null, tieLine: null, cueBox: null, outboards: [], preampId: null,
  preampText: null, polarityFlip: false, notes: null, color: null, groupId: null, startTime: null,
  copyKey: null, ...over
})
const divider = (name, over = {}) => row(name, { instrumentType: 'band_divider', ...over })
const names = { mic: (r) => r.micText, preamp: (r) => r.preampText, outboards: () => null }
const render = (lines) => lines.map((l) => (l.kind === 'body' ? `  ${l.text}` : l.text))

// Two bands: OH L changes mic, OH R leaves, Banjo arrives, Kick is renamed only (no work).
const sample = {
  name: 'Ensemble Café',
  items: [
    divider('The Early Set'),
    row('Kick', { channel: 1, micText: 'D6', copyKey: 'a' }),
    row('OH L', { channel: 2, micText: 'KM184', phantomPower: true, copyKey: 'b' }),
    row('OH R', { channel: 3, micText: 'KM184', phantomPower: true, copyKey: 'c' }),
    divider('Late Band', { startTime: '7:00 pm' }),
    row('Kick In', { channel: 1, micText: 'D6', copyKey: 'a' }),
    row('OH L', { channel: 2, micText: 'SM81', phantomPower: true, copyKey: 'b' }),
    row('Banjo', { channel: 4, micText: 'SM81', tieLine: '4' })
  ]
}
const page = changeoverLines(sample, 1, names)
console.log('Sample page:\n' + render(page.lines).map((l) => `    | ${sanitizeForWinAnsi(l)}`).join('\n') + '\n')

check('band name for the file name', page.bandName, 'Late Band')
check('the page lines', render(page.lines), [
  'Changeover',
  'Ensemble Café',
  'The Early Set → Late Band (7:00 pm)',
  'Re-patch',
  '  OH L (ch 2): mic KM184 → SM81',
  'Add',
  '  Add Banjo (ch 4): SM81, TL 4',
  'Remove',
  '  Remove OH R (ch 3)'
])
check('every line survives WinAnsi with -> for the arrow', page.lines.map((l) => sanitizeForWinAnsi(l.text))[2], 'The Early Set -> Late Band (7:00 pm)')

const same = {
  name: 'S',
  items: [divider('A'), row('Kick', { channel: 1, copyKey: 'a' }), divider(''), row('Kick 2', { channel: 1, copyKey: 'a' })]
}
check('no changes: unnamed band falls back to Band N, no time, one line', render(changeoverLines(same, 1, names).lines), [
  'Changeover',
  'S',
  'A → Band 2',
  '  No changes from A.'
])
check('only non-empty sections print', changeoverLines(
  { name: 'S', items: [divider('A'), row('Kick', { copyKey: 'a' }), divider('B')] }, 1, names
).lines.filter((l) => l.kind === 'heading').map((l) => l.text), ['Remove'])

const throws = (fn) => { try { fn(); return false } catch { return true } }
check('band 0 throws', throws(() => changeoverLines(sample, 0, names)), true)
check('a band past the end throws', throws(() => changeoverLines(sample, 2, names)), true)
check('a sheet without dividers throws for band 1', throws(() => changeoverLines({ name: 'S', items: [row('Kick')] }, 1, names)), true)

const bytes = await buildChangeoverPdf(page.lines)
const doc = await PDFDocument.load(bytes)
check('the sample builds a one-page PDF', doc.getPageCount(), 1)
const long = Array.from({ length: 120 }, (_, i) => ({ kind: 'body', text: `Remove Row ${i} 鼓 Dvořák → ` + 'x '.repeat(80) }))
check('a long list with unencodable text runs onto more pages', (await PDFDocument.load(await buildChangeoverPdf(long))).getPageCount() > 1, true)

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
