// Checks the text rules the exports apply: line breaks, tabs and carriage returns in the PDF
// (sanitizeForWinAnsi), the suggested file name (exportFileName) and the spreadsheet's sheet name
// (sanitizeSheetName). Run with `node scripts/check_export_text.mjs`; exits non-zero on any failure.
//
// The modules are TypeScript, so esbuild bundles them to a temp file first. The export modules
// import Electron, exceljs and the database at the top; those are stubbed out, since the functions
// checked here never touch them.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'export-text-'))
const entry = join(dir, 'entry.ts')
const out = join(dir, 'exportText.mjs')
writeFileSync(
  entry,
  [
    `export { sanitizeForWinAnsi } from ${JSON.stringify(join(root, 'src/main/pdf/pdfLayout.ts'))}`,
    `export { exportFileName } from ${JSON.stringify(join(root, 'src/main/db/exportShared.ts'))}`,
    `export { sanitizeSheetName } from ${JSON.stringify(join(root, 'src/main/spreadsheet/exportSetupSpreadsheet.ts'))}`
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
        // Electron, exceljs, the SQLite driver, pdf-lib and the repositories become empty modules.
        build.onResolve({ filter: /^(electron|exceljs|better-sqlite3|pdf-lib)$|\/repositories\/|\/db\/index$/ }, (args) => ({
          path: args.path,
          namespace: 'stub'
        }))
        build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'module.exports = {}', loader: 'js' }))
      }
    }
  ]
})
const { sanitizeForWinAnsi, exportFileName, sanitizeSheetName } = await import(pathToFileURL(out).href)
rmSync(dir, { recursive: true, force: true })

let failures = 0
function check(name, got, expected) {
  const ok = got === expected
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(got)}`}`)
}

console.log('sanitizeForWinAnsi')
check('keeps a line break', sanitizeForWinAnsi('Kick in\nKick out'), 'Kick in\nKick out')
check('drops a Windows carriage return', sanitizeForWinAnsi('Kick in\r\nKick out'), 'Kick in\nKick out')
check('turns a tab into a space', sanitizeForWinAnsi('Gain\t+6'), 'Gain +6')
check('still degrades a letter WinAnsi lacks', sanitizeForWinAnsi('Dvořák'), 'Dvorák')
check('still marks an unencodable character', sanitizeForWinAnsi('鼓'), '?')

console.log('\nexportFileName')
check('keeps an accented letter', exportFileName('Ensemble Café'), 'Ensemble Café')
check('keeps a non-Latin name', exportFileName('録音セッション'), '録音セッション')
check('drops a colon, keeps the ampersand', exportFileName('Rock & Roll: Take 2'), 'Rock & Roll Take 2')
check('drops slashes and control characters', exportFileName('A/B\\C\tD\n'), 'ABCD')
check('falls back to Setup when nothing is left', exportFileName(' / : '), 'Setup')
check('keeps an apostrophe', exportFileName("'Round Midnight"), "'Round Midnight")

console.log('\nsanitizeSheetName')
check('drops a leading apostrophe', sanitizeSheetName("'Round Midnight"), 'Round Midnight')
check('drops a trailing apostrophe', sanitizeSheetName("Rockin'"), 'Rockin')
check('drops an apostrophe left at the end by the 31-character cut', sanitizeSheetName(`${'x'.repeat(30)}'s`), 'x'.repeat(30))
check('replaces the reserved name History', sanitizeSheetName('History'), 'Setup')
check('replaces History in any case', sanitizeSheetName('history'), 'Setup')
check('falls back to Setup when only quotes are left', sanitizeSheetName("''"), 'Setup')
check('falls back to Setup for an empty name', sanitizeSheetName(''), 'Setup')
check('keeps an accented letter', sanitizeSheetName('Ensemble Café'), 'Ensemble Café')
check('keeps a non-Latin name', sanitizeSheetName('録音セッション'), '録音セッション')
check('drops a colon', sanitizeSheetName('Rock & Roll: Take 2'), 'Rock & Roll Take 2')
check('caps the name at 31 characters', sanitizeSheetName('y'.repeat(40)).length, 31)

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
