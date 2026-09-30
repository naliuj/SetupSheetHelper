import { canonicalMicKey } from '../constants/berkleeMicRenames'
import { gearIdentityKey, stripManufacturerPrefix } from './manufacturerPrefix'

/** Reading a studio's gear out of a spreadsheet — a CSV file, or cells pasted from Excel, Numbers
 *  or Google Sheets — for the studio setup page's "Import from a spreadsheet…".
 *
 *  There is no standard layout for a gear list, and asking for one would fail on the first real
 *  file: columns are called anything ("Mic Model", "Brand", "Qty"), come in any order, sit under a
 *  title row, use semicolons where Excel is set to a European locale, fold the manufacturer into
 *  the name, and write quantities as "2x" or leave them blank. So nothing here rejects a file for
 *  its shape: it guesses, the modal shows the guesses for the user to correct, and each row that
 *  can't be read says why instead of failing the import. Pure functions, no DOM — the fixtures in
 *  scripts/fixtures/spreadsheet-gear exercise each case. */

export type GearKind = 'mic' | 'outboard' | 'preamp'
export type ColumnField = 'name' | 'manufacturer' | 'category' | 'quantity' | 'type' | 'ignore'
/** One kind for every row, or read each row's kind from its Type column. */
export type KindMode = GearKind | 'column'
/** 'none' is a one-column file: every line is one cell, whatever punctuation it holds. */
export type Delimiter = ',' | ';' | '\t' | 'none'

export const MAX_IMPORT_ROWS = 2000

/** Far past any real gear list, and small enough that a wrongly chosen file (a video, a disk image
 *  renamed .csv) is refused rather than read into memory. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024

/** The file types the importer reads, for the open dialog's filter and for checking a dropped file. */
export const SPREADSHEET_EXTENSIONS = ['csv', 'tsv', 'txt'] as const

/** Text from a spreadsheet export, whatever it was saved as. UTF-8 first — Mac Excel, Numbers and
 *  Google Sheets all write it — and only if the bytes aren't valid UTF-8, Windows-1252, which is
 *  what Excel on Windows still writes for plain "CSV (Comma delimited)". Reading that as UTF-8 is
 *  how "Brüel & Kjær" becomes "Br�el & Kj�r". Shared by the file picker (main) and drag-and-drop
 *  (renderer), so a file reads the same whichever way it arrives. */
export function decodeSpreadsheet(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** One row of the sheet, with the 1-based line it started on in the original text — what "Row 14"
 *  means to someone looking at the file in Excel, blank lines and title lines included. */
export interface SheetRow {
  cells: string[]
  line: number
}

export interface ParsedSheet {
  rows: SheetRow[]
  delimiter: Delimiter
  /** Title or note lines above the table that were dropped (see dropLeadingTitleRows). */
  skippedLeadingRows: number
  /** Set, with `rows` empty, when the sheet has more rows than one import takes — checked before
   *  any per-row work, so a huge file is refused rather than parsed. */
  tooManyRows: number | null
}

/** Splits delimited text into rows of cells, RFC 4180 style: a cell that starts with a quote may
 *  hold the delimiter, line breaks and doubled quotes; a quote anywhere else is an ordinary
 *  character (5" reel). A quote never closed — someone's stray keystroke — would otherwise swallow
 *  the whole rest of the file into one cell, so at the end it is re-read as a literal quote. */
function splitDelimited(text: string, delimiter: Delimiter): SheetRow[] {
  const sep = delimiter === 'none' ? '\0' : delimiter
  const rows: SheetRow[] = []
  let row: string[] = []
  let cell = ''
  // Whether anything but whitespace has gone into the cell yet — only then is a quote literal.
  let cellStarted = false
  let quoted = false
  let line = 1
  let rowLine = 1
  // Where the open quote began, and the state to rewind to if it never closes.
  let mark: { i: number; row: string[]; cell: string; line: number; rowLine: number } | null = null
  let i = 0
  for (;;) {
    while (i < text.length) {
      const ch = text[i]
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"'
            i++
          } else {
            quoted = false
            mark = null
          }
        } else {
          if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) line++
          cell += ch
        }
      } else if (ch === '"' && !cellStarted) {
        mark = { i, row: [...row], cell, line, rowLine }
        quoted = true
        cellStarted = true
        cell = ''
      } else if (ch === sep) {
        row.push(cell)
        cell = ''
        cellStarted = false
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++
        row.push(cell)
        rows.push({ cells: row, line: rowLine })
        row = []
        cell = ''
        cellStarted = false
        line++
        rowLine = line
      } else {
        if (!/\s/.test(ch)) cellStarted = true
        cell += ch
      }
      i++
    }
    if (!quoted || !mark) break
    // Rewind to the unclosed quote and read it as text. Only the last quote can be unclosed, so
    // this happens at most once.
    row = mark.row
    cell = mark.cell + '"'
    line = mark.line
    rowLine = mark.rowLine
    i = mark.i + 1
    quoted = false
    cellStarted = true
    mark = null
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push({ cells: row, line: rowLine })
  }
  for (const r of rows) r.cells = r.cells.map((c) => c.trim())
  return rows
}

const isBlankRow = (row: SheetRow): boolean => row.cells.every((c) => c === '')
const filledCount = (row: SheetRow): number => row.cells.filter((c) => c !== '').length

/** The delimiter that splits the start of the file most consistently into more than one column,
 *  or 'none' when nothing does — a plain list of names, one per line, must not be split on a comma
 *  inside one of them. Tab first on a tie, since pasted cells are tab-separated and their names can
 *  contain commas. */
function sniffDelimiter(text: string): Delimiter {
  const sample = text.split(/\r\n|\r|\n/).slice(0, 30).join('\n')
  let best: { delimiter: Delimiter; score: number } = { delimiter: 'none', score: -1 }
  for (const delimiter of ['\t', ',', ';'] as Delimiter[]) {
    const counts = splitDelimited(sample, delimiter)
      .filter((r) => !isBlankRow(r))
      .map((r) => r.cells.length)
    if (counts.length === 0) continue
    const freq = new Map<number, number>()
    for (const n of counts) freq.set(n, (freq.get(n) ?? 0) + 1)
    const [mode, hits] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]
    if (mode < 2) continue
    const score = hits / counts.length
    if (score > best.score) best = { delimiter, score }
  }
  return best.delimiter
}

/** Inventory sheets often open with a title ("Studio C — Mic Inventory") and a date line above the
 *  real header row. Leading rows with a single filled cell are dropped when a header row follows
 *  them — and only then: a headerless two-column list whose first rows happen to have a blank
 *  second cell looks the same from the front, and those rows are gear. */
function dropLeadingTitleRows(rows: SheetRow[]): { rows: SheetRow[]; skipped: number } {
  let widest = 0
  for (const r of rows) widest = Math.max(widest, filledCount(r))
  if (widest < 2) return { rows, skipped: 0 }
  let skipped = 0
  while (skipped < rows.length - 1 && filledCount(rows[skipped]) <= 1) skipped++
  if (skipped === 0 || !guessHasHeader(rows.slice(skipped))) return { rows, skipped: 0 }
  return { rows: rows.slice(skipped), skipped }
}

export function parseDelimited(text: string): ParsedSheet {
  const clean = text.replace(/^﻿/, '')
  const delimiter = sniffDelimiter(clean)
  const all = splitDelimited(clean, delimiter).filter((r) => !isBlankRow(r))
  if (all.length > MAX_IMPORT_ROWS + 1) return { rows: [], delimiter, skippedLeadingRows: 0, tooManyRows: all.length }
  const { rows, skipped } = dropLeadingTitleRows(all)
  // Pad every row to the widest, so a row missing trailing cells still lines up with the columns.
  let width = 0
  for (const r of rows) width = Math.max(width, r.cells.length)
  for (const r of rows) while (r.cells.length < width) r.cells.push('')
  return { rows, delimiter, skippedLeadingRows: skipped, tooManyRows: null }
}

const normalizeHeader = (h: string): string => (h.trim() === '#' ? '#' : h.toLowerCase().replace(/[^a-z0-9#]/g, ''))

const HEADER_SYNONYMS: Record<Exclude<ColumnField, 'ignore' | 'type' | 'category'>, string[]> = {
  name: ['name', 'model', 'mic', 'mics', 'microphone', 'item', 'description', 'gear', 'equipment', 'unit', 'micmodel',
    'modelname', 'product', 'modelnumber', 'itemname', 'gearname', 'device'],
  manufacturer: ['manufacturer', 'brand', 'make', 'mfr', 'mfg', 'maker', 'company', 'vendor', 'manuf', 'brandname'],
  quantity: ['qty', 'quantity', 'count', 'number', 'num', '#', 'amount', 'units', 'pcs', 'channels', 'ch', 'chs',
    'howmany', 'onhand', 'stock', 'numberofunits', 'total']
}
/** Quantity synonyms that as often head something else — a row index ("#"), an input's channel
 *  number ("Ch"), a sheet's total line — so the guess is shown for checking. */
const AMBIGUOUS_QUANTITY = ['#', 'ch', 'chs', 'number', 'num', 'total', 'units', 'amount', 'stock', 'onhand']
const CATEGORY_HEADERS = ['category', 'cat', 'class', 'group', 'pattern', 'polarpattern', 'style', 'capsule', 'subcategory']
const TYPE_HEADERS = ['type', 'kind', 'geartype', 'section', 'department', 'itemtype', 'equipmenttype']

/** What a column header means: an exact synonym first, then the shape of the word ("Mic Name",
 *  "Model No.", "Qty on hand", "Manufacturer Name"). `sure` is false for a match that is only
 *  probably right. */
function headerField(header: string): { field: ColumnField | 'typeish'; sure: boolean } | null {
  const h = normalizeHeader(header)
  if (!h) return null
  for (const [field, words] of Object.entries(HEADER_SYNONYMS)) {
    if (words.includes(h)) return { field: field as ColumnField, sure: !AMBIGUOUS_QUANTITY.includes(h) }
  }
  if (CATEGORY_HEADERS.includes(h)) return { field: 'category', sure: true }
  if (TYPE_HEADERS.includes(h)) return { field: 'typeish', sure: false }
  if (h.includes('qty') || h.includes('quantity')) return { field: 'quantity', sure: true }
  if (/^(manufactur|brand|mfr|vendor|maker)/.test(h)) return { field: 'manufacturer', sure: true }
  if (h.endsWith('name') || h.includes('model')) return { field: 'name', sure: true }
  if (h.includes('units') || h.includes('count')) return { field: 'quantity', sure: false }
  return null
}

const isInteger = (v: string): boolean => /^\d+$/.test(v.trim())

/** True when the first row reads as a header row. Two recognized column names settle it; one is
 *  enough only if nothing in the row is a plain number — "Mic, Neumann, U 87 Ai, 2" is not a mic
 *  named "Mic", it's the first row of a headerless list. */
export function guessHasHeader(rows: SheetRow[]): boolean {
  if (rows.length === 0) return false
  const cells = rows[0].cells
  const recognized = cells.filter((c) => headerField(c) != null).length
  return recognized >= 2 || (recognized === 1 && !cells.some(isInteger))
}

/** Reads a row's gear kind from a Type-column value, or null if it isn't one. */
export function parseGearKind(value: string): GearKind | null {
  const v = value.toLowerCase().replace(/[^a-z]/g, '')
  if (!v) return null
  if (['mic', 'mics', 'microphone', 'microphones'].includes(v)) return 'mic'
  if (['preamp', 'preamps', 'pre', 'pres', 'micpre', 'micpres', 'micpreamp', 'preamplifier', 'micpreamps'].includes(v))
    return 'preamp'
  if (
    ['outboard', 'processor', 'processors', 'processing', 'compressor', 'compressors', 'limiter', 'eq', 'equalizer',
      'reverb', 'delay', 'effect', 'effects', 'fx', 'dynamics', 'rack', 'outboardgear'].includes(v)
  )
    return 'outboard'
  return null
}

export interface ColumnGuess {
  field: ColumnField
  /** Shown with an amber "check this" note: the guess rests on the column's contents or an
   *  ambiguous name rather than a clear header. */
  uncertain: boolean
}

const BLANK_COUNT = ['', '—', '–', '-', 'n/a', 'na']

/** A column that just numbers the rows 1, 2, 3… — never a quantity, whatever it is called. */
function isIndexColumn(values: string[]): boolean {
  return values.length >= 2 && values.every((v, i) => v.trim() === String(i + 1))
}

/** A first guess at what each column holds. Each field goes to at most one column, and anything
 *  unrecognized is left out ("Don't import") rather than guessed at. */
export function guessMapping(header: string[] | null, dataRows: SheetRow[]): ColumnGuess[] {
  let width = header?.length ?? 0
  for (const r of dataRows) width = Math.max(width, r.cells.length)
  const guesses: ColumnGuess[] = Array.from({ length: width }, () => ({ field: 'ignore', uncertain: false }))
  const taken = new Set<ColumnField>()
  const column = (i: number): string[] => dataRows.map((r) => r.cells[i] ?? '').filter((v) => v !== '')
  const assign = (i: number, field: ColumnField, uncertain: boolean): void => {
    if (field === 'ignore' || taken.has(field) || guesses[i].field !== 'ignore') return
    if (field === 'quantity' && isIndexColumn(column(i))) return
    guesses[i] = { field, uncertain }
    taken.add(field)
  }

  if (header) {
    header.forEach((h, i) => {
      const f = headerField(h)
      if (f && f.field !== 'typeish') assign(i, f.field, !f.sure)
    })
    // "Type" is ambiguous: mic / outboard / preamp, or Condenser / Dynamic? Decide by the values. A
    // column literally called Type whose values are kinds is what the app's own template has, so
    // that one is sure; anything else is shown for checking.
    header.forEach((h, i) => {
      if (headerField(h)?.field !== 'typeish') return
      const values = column(i)
      const kinds = values.filter((v) => parseGearKind(v) != null).length
      const isKind = values.length > 0 && kinds / values.length >= 0.6
      assign(i, isKind ? 'type' : 'category', !(isKind && normalizeHeader(h) === 'type'))
    })
  } else {
    // No header. A column that is nothing but counts is the quantity (blanks and dashes allowed —
    // an unfilled cell is not a reason to doubt the column); of the text columns, the one with the
    // most distinct values is the name, since a manufacturer column repeats itself. Both are only
    // guesses, and are flagged as such.
    for (let i = 0; i < width; i++) {
      const values = column(i).filter((v) => !BLANK_COUNT.includes(v.toLowerCase()))
      if (values.length > 0 && values.every((v) => !parseCount(v).note)) {
        assign(i, 'quantity', true)
        break
      }
    }
    let nameCol = -1
    let mostDistinct = 0
    for (let i = 0; i < width; i++) {
      if (guesses[i].field !== 'ignore') continue
      const distinct = new Set(column(i).map((v) => v.toLowerCase())).size
      if (distinct > mostDistinct) {
        mostDistinct = distinct
        nameCol = i
      }
    }
    if (nameCol >= 0) assign(nameCol, 'name', true)
  }
  return guesses
}

/** Beyond this a "quantity" is almost certainly a serial number or a channel count in the wrong
 *  column, not a number of units. */
const MAX_PLAUSIBLE_COUNT = 999

/** "2", "2x", "x2", "2 pcs", "8 ch", "2.0", "1,000" → the number. A blank reads as 1 (a listed item
 *  is at least one), with a note. Anything else is counted as 1 and flagged, so one odd cell
 *  doesn't cost the row. Zero is its own answer — the caller skips the row. */
export function parseCount(raw: string): { value: number; note?: string } {
  const v = raw.trim().toLowerCase()
  if (BLANK_COUNT.includes(v)) return { value: 1, note: 'blank quantity counted as 1' }
  const m = /^(?:x\s*)?(\d{1,3}(?:,\d{3})*|\d+)(?:\.0+)?\s*(?:x|pcs?|pieces?|units?|ea|each|ch|chs|channels?)?\.?$/.exec(v)
  const value = m ? Number(m[1].replace(/,/g, '')) : NaN
  if (!Number.isFinite(value)) return { value: 1, note: `couldn't read quantity "${raw.trim()}" — counted as 1` }
  if (value > MAX_PLAUSIBLE_COUNT) return { value: 1, note: `quantity ${raw.trim()} looks wrong — counted as 1` }
  return { value }
}

const TOTALS = ['total', 'totals', 'sum', 'grandtotal', 'subtotal']

export interface ImportRow {
  /** The line in the file, as the user sees it, for pointing at a problem row. */
  rowNumber: number
  kind: GearKind | null
  name: string
  manufacturer: string | null
  category: string | null
  count: number
  notes: string[]
  /** Set when the row is not imported, saying why. */
  skipReason: string | null
}

/** Runs of any whitespace, non-breaking spaces included, to one space — a copy-pasted "U 87  Ai" is
 *  the same mic as "U 87 Ai", and the mic matcher compares names as they are. */
const tidy = (s: string): string => s.replace(/[\s ]+/g, ' ').trim()

/** Turns the data rows into gear, using the mapping the user confirmed. `knownManufacturers` (every
 *  maker already in the app's catalogue) lets a name like "Neumann U 87 Ai" be split when the row
 *  has no manufacturer of its own. Names are stored without their manufacturer in front, the way the
 *  page's manual entry form stores them. */
export function buildImportRows(
  dataRows: SheetRow[],
  mapping: ColumnField[],
  kindMode: KindMode,
  knownManufacturers: string[]
): ImportRow[] {
  const col = (field: ColumnField): number => mapping.indexOf(field)
  const [nameCol, mfrCol, catCol, qtyCol, typeCol] = (['name', 'manufacturer', 'category', 'quantity', 'type'] as const).map(col)
  // Longest first, so "Universal Audio" wins over a maker called "Universal".
  const makers = [...new Set(knownManufacturers.map(tidy).filter(Boolean))].sort((a, b) => b.length - a.length)

  return dataRows.map((row) => {
    const cell = (c: number): string => (c >= 0 ? tidy(row.cells[c] ?? '') : '')
    const notes: string[] = []
    let name = cell(nameCol)
    let manufacturer: string | null = cell(mfrCol) || null
    if (!manufacturer && name) {
      const maker = makers.find((m) => name.toLowerCase().startsWith(m.toLowerCase() + ' '))
      if (maker) {
        manufacturer = maker
        name = name.slice(maker.length).trim()
        notes.push(`manufacturer ${maker} taken from the name`)
      }
    } else if (manufacturer) {
      name = stripManufacturerPrefix(name, manufacturer)
    }
    let count = 1
    if (qtyCol >= 0) {
      const parsed = parseCount(cell(qtyCol))
      count = parsed.value
      if (parsed.note) notes.push(parsed.note)
    }
    const kind: GearKind | null = kindMode === 'column' ? parseGearKind(cell(typeCol)) : kindMode

    let skipReason: string | null = null
    if (!name) skipReason = 'no name'
    else if (TOTALS.includes(name.toLowerCase().replace(/[^a-z]/g, ''))) skipReason = 'looks like a totals row'
    else if (qtyCol >= 0 && count === 0) skipReason = 'quantity is 0'
    else if (!kind) skipReason = cell(typeCol) ? `unknown type "${cell(typeCol)}"` : 'no type'

    return { rowNumber: row.line, kind, name, manufacturer, category: cell(catCol) || null, count, notes, skipReason }
  })
}

/** Gear already listed on the studio page (saved or still pending), to merge imports into. */
export interface ExistingGear {
  key: string
  kind: GearKind
  name: string
  manufacturer: string | null
  count: number
}

export interface PlannedItem {
  kind: GearKind
  name: string
  manufacturer: string | null
  category: string | null
  /** How many this import adds (channels, for a preamp). */
  count: number
  rowNumbers: number[]
  notes: string[]
  /** The existing row this adds to, or null for a new one. `spelledAs` is its name when that
   *  differs from the file's — the same mic under a retired spelling, say. */
  target: { key: string; existingCount: number; spelledAs: string | null } | null
}

/** One identity per physical model, whether or not the name repeats the manufacturer in front
 *  (most seeded outboard is stored "API 2500" + API; the manual form stores "2500" + API). Mics go
 *  through canonicalMicKey, so a retired spelling (AT-4050) matches the current one (AT4050);
 *  everything else through gearIdentityKey. Kind is part of it — a mic and an outboard box never
 *  merge. */
function identity(kind: GearKind, name: string, manufacturer: string | null): string {
  const model = stripManufacturerPrefix(name, manufacturer ?? '')
  return `${kind}:${kind === 'mic' ? canonicalMicKey(manufacturer, model) : gearIdentityKey(model, manufacturer)}`
}

/** The name part of a mic's canonical key — its current spelling, lowercased. */
const canonicalMicName = (manufacturer: string | null, name: string): string =>
  canonicalMicKey(manufacturer, name).split('|')[1] ?? name.toLowerCase()

/** Merges the readable rows into one item per model — repeated rows add their counts, and a model
 *  the studio already lists adds to that row — so an import never leaves "SM57" on the page twice.
 *
 *  A row with no manufacturer still finds "Shure SM57" when it is the only SM57 of its kind. For
 *  outboard and preamps a same-named row is matched even under a different manufacturer: their
 *  names are unique per studio in the database, so a second "1073" could never be saved anyway. */
export function planImport(rows: ImportRow[], existing: ExistingGear[]): PlannedItem[] {
  const existingById = new Map<string, ExistingGear>()
  const listedTwice = new Set<string>()
  const byKindAndName = new Map<string, ExistingGear[]>()
  for (const e of existing) {
    const id = identity(e.kind, e.name, e.manufacturer)
    if (existingById.has(id)) listedTwice.add(id)
    else existingById.set(id, e)
    const nameKey = `${e.kind}|${stripManufacturerPrefix(e.name, e.manufacturer ?? '').toLowerCase()}`
    byKindAndName.set(nameKey, [...(byKindAndName.get(nameKey) ?? []), e])
  }

  /** The existing row a readable row adds to, by identity first, then by name alone where that is
   *  safe (see above). */
  function findTarget(kind: GearKind, row: ImportRow): ExistingGear | null {
    const direct = existingById.get(identity(kind, row.name, row.manufacturer))
    if (direct) return direct
    if (row.manufacturer && kind === 'mic') return null
    const sameName = byKindAndName.get(`${kind}|${row.name.toLowerCase()}`) ?? []
    return sameName.length === 1 ? sameName[0] : null
  }

  const planned = new Map<string, PlannedItem>()
  for (const row of rows) {
    if (row.skipReason || !row.kind) continue
    const kind = row.kind
    const target = findTarget(kind, row)
    // Rows that land on the same existing row merge, whatever they called it.
    const id = target ? identity(kind, target.name, target.manufacturer) : identity(kind, row.name, row.manufacturer)
    const item = planned.get(id)
    if (item) {
      item.count += row.count
      item.rowNumbers.push(row.rowNumber)
      for (const note of row.notes) if (!item.notes.includes(note)) item.notes.push(note)
      item.category = item.category ?? row.category
      // Between two spellings of one mic, keep the current one.
      if (kind === 'mic' && row.name.toLowerCase() === canonicalMicName(row.manufacturer, row.name)) item.name = row.name
      continue
    }
    const notes = [...row.notes]
    if (target && listedTwice.has(id)) notes.push('this studio lists it twice — added to the first')
    if (target && row.manufacturer && target.manufacturer && identity(kind, row.name, row.manufacturer) !== id) {
      notes.push(`matched by name — your row says ${target.manufacturer}, the file says ${row.manufacturer}`)
    }
    planned.set(id, {
      kind,
      name: row.name,
      manufacturer: row.manufacturer ?? target?.manufacturer ?? null,
      category: row.category,
      count: row.count,
      rowNumbers: [row.rowNumber],
      notes,
      target: target
        ? {
            key: target.key,
            existingCount: target.count,
            spelledAs:
              stripManufacturerPrefix(target.name, target.manufacturer ?? '').toLowerCase() === row.name.toLowerCase()
                ? null
                : target.name
          }
        : null
    })
  }
  return [...planned.values()]
}
