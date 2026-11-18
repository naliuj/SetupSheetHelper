// Checks how the exports treat several bands in one sheet: the per-band tie line clash check, the
// band heading text, sheet name dedupe, and then a real 2-band PDF and spreadsheet built through
// exportSetupPdf / exportSetupSpreadsheet in both band layouts (plus a sheet without bands).
// Run with `node scripts/check_band_exports.mjs`; exits non-zero on any failure.
//
// The modules are TypeScript, so esbuild bundles them to a temp file first. Electron's save
// dialog and the database repositories are replaced by small fakes that hand the export a sample
// setup and a file path in the system temp dir; pdf-lib and exceljs are the real ones.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import ExcelJS from 'exceljs'
import { PDFDocument } from 'pdf-lib'

const root = fileURLToPath(new URL('..', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'band-exports-'))
const entry = join(dir, 'entry.ts')
const out = join(dir, 'bandExports.mjs')
const src = (path) => JSON.stringify(join(root, path))
writeFileSync(
  entry,
  [
    `export { tieLineConflictIds } from ${src('src/main/pdf/pdfLayout.ts')}`,
    `export { bandTitle } from ${src('src/main/db/exportShared.ts')}`,
    `export { exportSetupPdf } from ${src('src/main/pdf/exportSetupPdf.ts')}`,
    `export { exportSetupSpreadsheet, uniqueSheetName } from ${src('src/main/spreadsheet/exportSetupSpreadsheet.ts')}`
  ].join('\n')
)
const FAKES = {
  electron: `export const dialog = { showSaveDialog: async () => ({ canceled: false, filePath: globalThis.__savePath }) }`,
  repositories: [
    'export const getSetupWithItems = () => globalThis.__setup',
    'export const getStudio = () => null',
    'export const listBuildings = () => []',
    'export const getSetting = () => null',
    'export const getMicsByIds = () => new Map()',
    'export const getPreampsByIds = () => new Map()',
    'export const getOutboardByIds = () => new Map()',
    'export const listCablesBySetup = () => []'
  ].join('\n'),
  importPatchbay: 'export const getPatchbayWithPoints = async () => null',
  empty: 'export {}'
}
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
  tsconfig: join(root, 'tsconfig.node.json'),
  // exceljs require()s Node built-ins, which an ESM bundle can only do through a real require.
  banner: { js: `import { createRequire } from 'node:module'; const require = createRequire(${src('package.json')});` },
  plugins: [
    {
      name: 'fake-runtime-deps',
      setup(build) {
        build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fake' }))
        build.onResolve({ filter: /\/repositories\// }, () => ({ path: 'repositories', namespace: 'fake' }))
        build.onResolve({ filter: /\/importPatchbay$/ }, () => ({ path: 'importPatchbay', namespace: 'fake' }))
        build.onResolve({ filter: /^better-sqlite3$|\/db\/index$/ }, () => ({ path: 'empty', namespace: 'fake' }))
        build.onLoad({ filter: /.*/, namespace: 'fake' }, (args) => ({ contents: FAKES[args.path], loader: 'js' }))
      }
    }
  ]
})
const { tieLineConflictIds, bandTitle, exportSetupPdf, exportSetupSpreadsheet, uniqueSheetName } = await import(
  pathToFileURL(out).href
)

let failures = 0
function check(name, got, expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(got)}`}`)
}

let nextId = 1
function row(fields = {}) {
  return {
    id: nextId++,
    setupId: 1,
    instrumentType: 'other',
    sourceName: '',
    micId: null,
    micText: null,
    phantomPower: false,
    channel: null,
    tieLine: null,
    cueBox: null,
    outboards: [],
    preampId: null,
    preampText: null,
    polarityFlip: false,
    notes: null,
    color: null,
    groupId: null,
    startTime: null,
    copyKey: null,
    ...fields
  }
}
const divider = (sourceName, fields = {}) => row({ instrumentType: 'band_divider', sourceName, ...fields })

console.log('tieLineConflictIds')
{
  const kick = row({ tieLine: '1' })
  const snare = row({ tieLine: '2' })
  const kick2 = row({ tieLine: ' 1 ' })
  const a = row({ tieLine: 'PB5' })
  const b = row({ tieLine: 'pb5' })
  check('a sheet without bands clashes across the whole sheet', [...tieLineConflictIds([kick, snare, kick2])], [kick.id, kick2.id])
  check(
    'the same tie line in two bands is not a clash',
    [...tieLineConflictIds([divider('One'), kick, snare, divider('Two'), kick2])],
    []
  )
  check(
    'a repeated tie line inside one band still clashes',
    [...tieLineConflictIds([divider('One'), kick, divider('Two'), kick2, a, b])],
    [a.id, b.id]
  )
}

console.log('\nbandTitle')
check('name and start time', bandTitle({ sourceName: 'Late set', startTime: '9:30 pm' }, 1), 'Late set · 9:30 pm')
check('name only', bandTitle({ sourceName: ' Late set ', startTime: '  ' }, 1), 'Late set')
check('an unnamed divider is numbered', bandTitle({ sourceName: '', startTime: null }, 2), 'Band 3')

console.log('\nuniqueSheetName')
check('a free name is kept', uniqueSheetName(['Trio'], 'Quartet'), 'Quartet')
check('a clash gets a number, case-insensitively', uniqueSheetName(['Trio'], 'trio'), 'trio (2)')
check('the next free number', uniqueSheetName(['Trio', 'Trio (2)'], 'Trio'), 'Trio (3)')
check('a long name is cut to fit the number', uniqueSheetName(['x'.repeat(31)], 'x'.repeat(31)), `${'x'.repeat(27)} (2)`)

// --- Real exports -------------------------------------------------------------------------------

function sampleSetup(items) {
  return {
    id: 1,
    studioId: 1,
    name: 'Band night',
    sessionDate: '2026-11-18',
    engineer: 'Sam',
    artist: null,
    sessionNotes: null,
    outboardColumnCount: 1,
    visibleColumns: ['stereoLink', 'sourceName', 'mic', 'phantomPower', 'outboard', 'channel', 'preamp', 'tieLine', 'cueBox', 'polarity', 'notes'],
    columnOrder: ['stereoLink', 'sourceName', 'mic', 'phantomPower', 'outboard', 'channel', 'preamp', 'tieLine', 'cueBox', 'polarity', 'notes'],
    items
  }
}
const bandRows = () => [
  row({ sourceName: 'Kick', micText: 'D112', channel: 1, tieLine: '1' }),
  row({ sourceName: 'OH L', micText: 'KM184', channel: 2, tieLine: '2', groupId: 'g1', phantomPower: true }),
  row({ sourceName: 'OH R', micText: 'KM184', channel: 3, tieLine: '3', groupId: 'g1', phantomPower: true })
]
// Both bands share a name, so the sheet-per-band names have to be deduped.
const twoBands = sampleSetup([
  divider('Opener', { startTime: '7:00 pm', notes: 'Drums from the house kit' }),
  ...bandRows(),
  divider('Opener', { startTime: '8:15 pm' }),
  ...bandRows()
])
const noBands = sampleSetup(bandRows())

async function pdfPages(setup, bandLayout) {
  globalThis.__setup = setup
  globalThis.__savePath = join(dir, `sheet-${bandLayout ?? 'none'}.pdf`)
  const result = await exportSetupPdf({
    setupId: 1,
    layoutImageDataUrl: null,
    parts: { sheet: true, layout: false, patchbay: false },
    patchbayImage: null,
    coloredRows: false,
    orientation: 'portrait',
    density: 'normal',
    bandLayout
  })
  return (await PDFDocument.load(readFileSync(result.filePath))).getPageCount()
}

async function workbook(setup, bandLayout) {
  globalThis.__setup = setup
  globalThis.__savePath = join(dir, `sheet-${bandLayout ?? 'none'}.xlsx`)
  const result = await exportSetupSpreadsheet({ setupId: 1, layoutImageDataUrl: null, patchbayImage: null, bandLayout })
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(result.filePath)
  return wb
}

console.log('\nPDF')
check('a sheet without bands is one page', await pdfPages(noBands, 'pagePerBand'), 1)
check('two short bands, continuous, share one page', await pdfPages(twoBands, 'continuous'), 1)
check('no layout given means continuous', await pdfPages(twoBands, undefined), 1)
check('two bands, page per band, take two pages', await pdfPages(twoBands, 'pagePerBand'), 2)

console.log('\nSpreadsheet')
{
  const wb = await workbook(noBands, 'pagePerBand')
  check('a sheet without bands is one sheet', wb.worksheets.map((ws) => ws.name), ['Band night'])
  check('with its header and three rows', wb.worksheets[0].rowCount, 4)
}
{
  const ws = (await workbook(twoBands, 'continuous')).worksheets
  check('continuous writes one sheet', ws.map((s) => s.name), ['Band night'])
  const sheet = ws[0]
  check('the band heading follows the header row', sheet.getCell('A2').value, 'Opener · 7:00 pm')
  check('in bold', sheet.getCell('A2').font?.bold, true)
  check('merged across the columns', sheet.getCell('J2').isMerged, true)
  check('only as far as the last column', sheet.getCell('K2').isMerged, false)
  check('the band notes sit under it', sheet.getCell('A3').value, 'Drums from the house kit')
  check('then the band rows', sheet.getCell('A4').value, 'Kick')
  check('the second band heading', sheet.getCell('A7').value, 'Opener · 8:15 pm')
}
{
  const ws = (await workbook(twoBands, 'pagePerBand')).worksheets
  check('a sheet per band, the clashing name numbered', ws.map((s) => s.name), ['Opener', 'Opener (2)'])
  check('each sheet opens with its band heading', ws[1].getCell('A2').value, 'Opener · 8:15 pm')
  check('and holds only its band', ws[1].rowCount, 5)
}

rmSync(dir, { recursive: true, force: true })
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
