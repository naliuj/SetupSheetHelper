// Checks the studio gear spreadsheet import (src/shared/utils/spreadsheetGear.ts) against every
// fixture in scripts/fixtures/spreadsheet-gear, the way ImportSpreadsheetModal drives it: decode,
// parse, guess the header and mapping, build rows, plan. Plus the merge cases a fixture doesn't
// cover. Run with `node scripts/check_spreadsheet_gear.mjs`; exits non-zero on any failure.
//
// The module is TypeScript with extensionless imports, so esbuild bundles it to a temp file first.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildSync } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'spreadsheet-gear-'))
const out = join(dir, 'spreadsheetGear.mjs')
buildSync({ entryPoints: [join(root, 'src/shared/utils/spreadsheetGear.ts')], bundle: true, format: 'esm', outfile: out, logLevel: 'error' })
const g = await import(pathToFileURL(out).href)
rmSync(dir, { recursive: true, force: true })

// Makers the app's catalog knows, so a name like "Neumann U 87 Ai" can be split.
const MAKERS = ['Neumann', 'Shure', 'AKG', 'Audio-Technica', 'Royer', 'Sennheiser', 'Coles', 'API', 'Universal Audio']

/** One import, start to finish. `kind` overrides the modal's default (a Type column if one was
 *  guessed, else mic), as the user would by clicking Outboard. */
function run(text, { kind, existing = [] } = {}) {
  const sheet = g.parseDelimited(text)
  const hasHeader = g.guessHasHeader(sheet.rows)
  const data = hasHeader ? sheet.rows.slice(1) : sheet.rows
  const guesses = g.guessMapping(hasHeader ? sheet.rows[0].cells : null, data)
  const mapping = guesses.map((x) => x.field)
  const kindMode = kind ?? (mapping.includes('type') ? 'column' : 'mic')
  const rows = g.buildImportRows(data, mapping, kindMode, MAKERS)
  const plan = g.planImport(rows, existing)
  return {
    delimiter: sheet.delimiter,
    hasHeader,
    skippedLeadingRows: sheet.skippedLeadingRows,
    mapping: guesses.map((x) => x.field + (x.uncertain ? '?' : '')).join(','),
    skipped: rows.filter((r) => r.skipReason).map((r) => `${r.rowNumber}: ${r.skipReason}`),
    notes: rows.flatMap((r) => r.notes.map((n) => `${r.rowNumber}: ${n}`)),
    plan: plan.map(
      (i) => `${i.kind} ${i.manufacturer ?? '-'} | ${i.name} x${i.count}${i.target ? ` -> ${i.target.key}` : ''}`
    ),
    planNotes: plan.flatMap((i) => i.notes.filter((n) => !/taken from the name|quantity/.test(n)))
  }
}

const fixture = (name) => g.decodeSpreadsheet(readFileSync(join(root, 'scripts/fixtures/spreadsheet-gear', name)))

let failures = 0
function check(name, got, expected) {
  // Only the fields the case names are compared.
  const picked = Object.fromEntries(Object.keys(expected).map((k) => [k, got[k]]))
  const ok = JSON.stringify(picked) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(picked)}`}`
  )
}

check('01 clean Excel UTF-8 (BOM, CRLF)', run(fixture('01-clean-excel-utf8.csv')), {
  delimiter: ',',
  mapping: 'manufacturer,name,category,quantity',
  plan: [
    'mic Neumann | U 87 Ai x2',
    'mic Shure | SM57 x6',
    'mic Shure | SM7B x2',
    'mic AKG | C414 XLII x2',
    'mic Royer | R-121 x1',
    'mic Sennheiser | MD 421-II x4',
    'mic Coles | 4038 x2',
    'mic Earthworks | TC30K x2'
  ]
})
check('02 semicolons, Type read as Category', run(fixture('02-semicolon-european.csv')), {
  delimiter: ';',
  mapping: 'manufacturer,name,quantity,category?',
  plan: [
    'mic Neumann | KM 184 x2',
    'mic Schoeps | CMC6 Mk4 x4',
    'mic Beyerdynamic | M 160 x1',
    'mic Electro-Voice | RE20 x2',
    'mic Audio-Technica | AT4050 x1'
  ]
})
check('03 Windows-1252 accents', run(fixture('03-windows-1252-accents.csv')), {
  delimiter: ',',
  mapping: 'manufacturer,name,quantity',
  plan: [
    'mic RØDE | NT5 x2',
    'mic Brüel & Kjær | 4006 x2',
    'mic DPA | 4011A – cardioid x2',
    'mic Schoeps | MK 4 – capsule only x3'
  ]
})
check('04 quoted cells, extra columns', run(fixture('04-quoted-with-extra-columns.csv')), {
  delimiter: ',',
  mapping: 'name,manufacturer,quantity,ignore,ignore,ignore',
  plan: ['mic Neumann | U 47 FET x1', 'mic AKG | 414 "B-ULS" x2', 'mic Mojave | MA-201fet x2', 'mic AKG | C12 VR x1']
})
check('05 no header row', run(fixture('05-no-header-row.csv')), {
  delimiter: ',',
  hasHeader: false,
  mapping: 'name?,ignore,quantity?',
  plan: ['mic - | SM58 x8', 'mic - | Beta 52A x1', 'mic - | Beta 91A x1', 'mic - | e 604 x4', 'mic - | i5 x2']
})
check(
  '06 mixed types, into a studio with a 1073 and an API 512c',
  run(fixture('06-mixed-types.csv'), {
    existing: [
      { key: 'neve', kind: 'preamp', name: '1073', manufacturer: 'Neve', count: 4 },
      { key: 'api', kind: 'preamp', name: 'API 512c', manufacturer: 'API', count: 2 }
    ]
  }),
  {
    delimiter: ',',
    mapping: 'type,manufacturer,name,quantity',
    plan: [
      'mic Neumann | U 87 Ai x2',
      'mic Shure | SM57 x4',
      'outboard Universal Audio | 1176LN x2',
      'outboard Teletronix | LA-2A x1',
      'outboard Bricasti Design | M7 Reverb x1',
      'preamp Neve | 1073 x8 -> neve',
      'preamp API | 512c x4 -> api',
      'mic Coles | 4038 x2',
      'outboard Empirical Labs | Distressor EL8 x2',
      'outboard dbx | 160A x2'
    ]
  }
)
check('07 messy names and quantities', run(fixture('07-messy-names-and-quantities.csv')), {
  delimiter: ',',
  mapping: 'name,quantity',
  skipped: ['10: no name', '12: looks like a totals row'],
  notes: [
    '2: manufacturer Neumann taken from the name',
    '3: manufacturer Shure taken from the name',
    '4: manufacturer Shure taken from the name',
    '5: manufacturer AKG taken from the name',
    '6: manufacturer Audio-Technica taken from the name',
    '7: manufacturer Audio-Technica taken from the name',
    '8: manufacturer Royer taken from the name',
    '8: blank quantity counted as 1',
    '9: manufacturer Sennheiser taken from the name',
    '9: blank quantity counted as 1',
    '11: manufacturer Coles taken from the name',
    `11: couldn't read quantity "two" — counted as 1`
  ],
  plan: [
    'mic Neumann | U 87 Ai x2',
    'mic Shure | SM57 x4',
    'mic AKG | C414 XLII x2',
    'mic Audio-Technica | AT4050 x2',
    'mic Royer | R-121 x1',
    'mic Sennheiser | MD 421-II x1',
    'mic Coles | 4038 x1'
  ]
})
check('08 pasted cells (tabs)', run(fixture('08-pasted-from-spreadsheet.txt')), {
  delimiter: '\t',
  mapping: 'manufacturer,name,quantity',
  plan: ['mic Neumann | U 67 x1', 'mic Telefunken | ELA M 251E x1', 'mic Shure | SM7B x2', 'mic Royer | R-10 x2']
})
check('09 title rows above the header', run(fixture('09-title-row-above-headers.csv')), {
  delimiter: ',',
  skippedLeadingRows: 2,
  mapping: 'manufacturer,name,category,quantity',
  plan: ['mic Neumann | TLM 103 x2', 'mic Shure | KSM32 x2', 'mic Sony | C-800G x1']
})
check('10 single column', run(fixture('10-single-column.csv')), {
  delimiter: 'none',
  mapping: 'name',
  plan: ['mic - | SM57 x1', 'mic - | Beta 52A, kick x1', 'mic - | SM58 x1', 'mic - | KSM32 x1']
})
check('11 headerless, blank second cells', run(fixture('11-headerless-two-columns.csv')), {
  delimiter: ',',
  hasHeader: false,
  skippedLeadingRows: 0,
  mapping: 'name?,quantity?',
  plan: ['mic - | SM57 x1', 'mic - | SM58 x1', 'mic - | U 87 Ai x2', 'mic - | C414 XLII x2']
})
check(
  '12 outboard named with its maker, into a studio that has it',
  run(fixture('12-outboard-prefixed.csv'), {
    kind: 'outboard',
    existing: [
      { key: '2500', kind: 'outboard', name: 'API 2500', manufacturer: 'API', count: 1 },
      { key: '1176', kind: 'outboard', name: 'Universal Audio 1176LN', manufacturer: 'Universal Audio', count: 2 }
    ]
  }),
  {
    delimiter: ',',
    mapping: 'manufacturer,name,quantity',
    plan: [
      'outboard API | 2500 x1 -> 2500',
      'outboard API | 512c x2',
      'outboard Universal Audio | 1176LN x1 -> 1176',
      'outboard Empirical Labs | Distressor EL8 x2'
    ]
  }
)
check(
  '13 name only, into a studio with a Shure SM57',
  run(fixture('13-name-only.csv'), {
    existing: [{ key: 'sm57', kind: 'mic', name: 'SM57', manufacturer: 'Shure', count: 6 }]
  }),
  {
    delimiter: ',',
    mapping: 'name,quantity',
    plan: ['mic Shure | SM57 x4 -> sm57', 'mic - | SM7B x1', 'mic - | U 87 Ai x1', 'mic - | KM 184 x2']
  }
)

// Merge cases no fixture covers.
check(
  'one 1176 with and without a manufacturer plans one item',
  run('Manufacturer,Name,Qty\n,1176,1\nUniversal Audio,1176,1\n', { kind: 'outboard' }),
  { plan: ['outboard Universal Audio | 1176 x2'] }
)
check(
  'one 1176 under two manufacturers plans one item, with a note',
  run('Manufacturer,Name,Qty\nUniversal Audio,1176,1\nTeletronix,1176,1\n', { kind: 'preamp' }),
  {
    plan: ['preamp Universal Audio | 1176 x2'],
    planNotes: ['merged by name — the file lists it under Universal Audio and Teletronix']
  }
)
check('a lowercase repeat keeps the first spelling', run('Manufacturer,Name,Qty\nShure,SM57,1\nshure,sm57,1\n'), {
  plan: ['mic Shure | SM57 x2']
})
check('a retired spelling after the current one keeps the current one', run('Mic,Qty\nAudio-Technica AT4050,1\nAudio-Technica AT-4050,1\n'), {
  plan: ['mic Audio-Technica | AT4050 x2']
})
check('"Company Name" is the manufacturer', run('Company Name,Model,Qty\nShure,SM57,2\n'), {
  mapping: 'manufacturer,name,quantity',
  plan: ['mic Shure | SM57 x2']
})

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
