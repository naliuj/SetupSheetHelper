// Checks how the exports treat several bands in one sheet: the per-band tie line clash check, the
// band heading text, sheet name dedupe, and then a real 2-band PDF and spreadsheet built through
// exportSetupPdf / exportSetupSpreadsheet in both band layouts (plus a sheet without bands), and
// the "Mark changes between bands" marks: off or on a sheet without bands the bytes must not move.
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
import { PDFArray, PDFDocument, PDFName, decodePDFRawStream } from 'pdf-lib'

const root = fileURLToPath(new URL('..', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'band-exports-'))
const entry = join(dir, 'entry.ts')
const out = join(dir, 'bandExports.mjs')
const src = (path) => JSON.stringify(join(root, path))
writeFileSync(
  entry,
  [
    `export { tieLineConflictIds } from ${src('src/main/pdf/pdfLayout.ts')}`,
    `export { bandTitle, bandChangeMarks } from ${src('src/main/db/exportShared.ts')}`,
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
const { tieLineConflictIds, bandTitle, bandChangeMarks, exportSetupPdf, exportSetupSpreadsheet, uniqueSheetName } = await import(
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

// --- Change marks ---------------------------------------------------------------------------------

// Both files stamp the time they were written; a fixed clock makes two exports comparable byte by byte.
const RealDate = Date
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [2026, 0, 1]))
  }
  static now() {
    return new RealDate(2026, 0, 1).getTime()
  }
}

async function pdfBytes(setup, extra) {
  globalThis.__setup = setup
  globalThis.__savePath = join(dir, 'marks.pdf')
  const result = await exportSetupPdf({
    setupId: 1,
    layoutImageDataUrl: null,
    parts: { sheet: true, layout: false, patchbay: false },
    patchbayImage: null,
    coloredRows: true,
    orientation: 'portrait',
    density: 'normal',
    ...extra
  })
  return readFileSync(result.filePath)
}
async function xlsxBytes(setup, extra) {
  globalThis.__setup = setup
  globalThis.__savePath = join(dir, 'marks.xlsx')
  const result = await exportSetupSpreadsheet({ setupId: 1, layoutImageDataUrl: null, patchbayImage: null, ...extra })
  return readFileSync(result.filePath)
}
/** Every string drawn on each page: pdf-lib writes WinAnsi text as `<hex> Tj`. */
async function pdfTexts(bytes) {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((page) => {
    const contents = page.node.get(PDFName.of('Contents'))
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents]
    const ops = refs.map((ref) => Buffer.from(decodePDFRawStream(doc.context.lookup(ref)).decode()).toString('latin1')).join('\n')
    return [...ops.matchAll(/<([0-9A-Fa-f]*)> Tj/g)].map((m) => Buffer.from(m[1], 'hex').toString('latin1'))
  })
}

console.log('\nChange marks: unchanged output when off')
const sameBytes = async (name, make, a, b) => check(name, (await make(a)).equals(await make(b)), true)
for (const [label, make] of [['PDF', pdfBytes], ['spreadsheet', xlsxBytes]]) {
  for (const bandLayout of ['continuous', 'pagePerBand']) {
    await sameBytes(`${label} ${bandLayout}: no bands, marks on = marks absent`, (o) => make(noBands, { bandLayout, ...o }), { markBandChanges: true }, {})
    await sameBytes(`${label} ${bandLayout}: bands, marks off = marks absent`, (o) => make(twoBands, { bandLayout, ...o }), { markBandChanges: false }, {})
  }
}

// Band 2 changes Kick's mic, keeps OH L (renamed only, so no mark), adds Vox and drops OH R.
const kick = row({ sourceName: 'Kick', micText: 'D112', channel: 1, tieLine: '1', copyKey: 'k', color: '#ff0000' })
const ohL = row({ sourceName: 'OH L', micText: 'KM184', channel: 2, copyKey: 'l', outboards: [{ slotIndex: 0, outboardId: null, outboardText: '1176' }] })
const ohR = row({ sourceName: 'OH R', micText: 'KM184', channel: 3, copyKey: 'r' })
const kick2 = row({ ...kick, id: nextId++, micText: 'SM91' })
const ohL2 = row({ ...ohL, id: nextId++, sourceName: 'OH Left' })
const vox = row({ sourceName: 'Vox', micText: 'SM7B', channel: 4, phantomPower: true, copyKey: 'v' })
const marked = sampleSetup([divider('Opener', { startTime: '7:00 pm' }), kick, ohL, ohR, divider('Headliner'), kick2, ohL2, vox])
const NOTE = 'Removed: OH R (ch 3) \u00b7 * changed from Opener'
{
  const m = bandChangeMarks(marked.items)
  check('only the changed mic is marked', [...m.cells.entries()].map(([id, keys]) => [id, [...keys]]), [[kick2.id, ['mic']]])
  check('the new row', [...m.newRows], [vox.id])
  check('the note follows the band\'s last row', [...m.notes.entries()], [[vox.id, NOTE]])
  const outboard = sampleSetup([divider('A'), ohL, divider('B'), row({ ...ohL, id: nextId++, outboards: [{ slotIndex: 0, outboardId: null, outboardText: 'LA-2A' }] })])
  check('a changed outboard marks its slot', [...[...bandChangeMarks(outboard.items).cells.values()][0]], ['outboard', 'outboard:0'])
  const emptied = sampleSetup([divider('A'), ohR, divider('B')])
  check('a band with no rows left has its note under its divider', [...bandChangeMarks(emptied.items).notes.keys()], [emptied.items[2].id])
}
for (const bandLayout of ['continuous', 'pagePerBand']) {
  const pages = await pdfTexts(await pdfBytes(marked, { bandLayout, markBandChanges: true }))
  const last = pages[pages.length - 1]
  check(`PDF ${bandLayout}: page count unchanged by the note`, pages.length, bandLayout === 'continuous' ? 1 : 2)
  check(`PDF ${bandLayout}: the changed mic carries " *"`, last.includes('SM91 *'), true)
  check(`PDF ${bandLayout}: the new row starts "+ "`, last.includes('+ Vox'), true)
  check(`PDF ${bandLayout}: the renamed row is unmarked`, last.includes('OH Left'), true)
  check(`PDF ${bandLayout}: the note is on its band's page`, last.includes(NOTE), true)
  check(`PDF ${bandLayout}: the first band is unmarked`, pages.flat().filter((t) => t.includes('*')).length, 2)
}
for (const bandLayout of ['continuous', 'pagePerBand']) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await xlsxBytes(marked, { bandLayout, markBandChanges: true }))
  const sheet = wb.worksheets[wb.worksheets.length - 1]
  const rows = []
  sheet.eachRow((r) => rows.push(r))
  const find = (text) => rows.find((r) => r.getCell(1).value === text)
  const kickRow = rows.filter((r) => r.getCell(1).value === 'Kick').pop()
  check(`spreadsheet ${bandLayout}: the changed mic gets "*"`, kickRow.getCell('B').value, 'SM91 *')
  check(`spreadsheet ${bandLayout}: in bold`, kickRow.getCell('B').font?.bold, true)
  check(`spreadsheet ${bandLayout}: keeping the row's text color`, kickRow.getCell('B').font?.color?.argb != null, true)
  check(`spreadsheet ${bandLayout}: on light gray`, kickRow.getCell('B').fill?.fgColor?.argb, 'FFD9D9D9')
  check(`spreadsheet ${bandLayout}: unchanged cells stay plain`, kickRow.getCell('A').font?.bold, undefined)
  check(`spreadsheet ${bandLayout}: the new row starts "+ "`, !!find('+ Vox'), true)
  const note = find(NOTE)
  check(`spreadsheet ${bandLayout}: the note is the band's last row`, note?.number, sheet.rowCount)
  check(`spreadsheet ${bandLayout}: in italic`, note?.getCell(1).font?.italic, true)
  check(`spreadsheet ${bandLayout}: merged across the columns`, sheet.getCell(note.number, 2).isMerged, true)
}

globalThis.Date = RealDate
rmSync(dir, { recursive: true, force: true })
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
