import { canonicalMicKey } from '../constants/berkleeMicRenames'
import { gearIdentityKey } from './manufacturerPrefix'

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
export type Delimiter = ',' | ';' | '\t'

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

export interface ParsedSheet {
  rows: string[][]
  delimiter: Delimiter
  /** Title or note lines above the table that were dropped (see dropLeadingTitleRows). */
  skippedLeadingRows: number
}

/** Splits delimited text into rows of cells, RFC 4180 style: quoted cells may hold the delimiter,
 *  line breaks and doubled quotes. */
function splitDelimited(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true
      cell = ''
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.trim()))
}

const isBlankRow = (row: string[]): boolean => row.every((c) => c === '')
const filledCount = (row: string[]): number => row.filter((c) => c !== '').length

/** The delimiter that splits the start of the file most consistently into more than one column.
 *  Tab first on a tie, since pasted cells are tab-separated and their names can contain commas. */
function sniffDelimiter(text: string): Delimiter {
  const sample = text.split(/\r?\n/).slice(0, 30).join('\n')
  let best: { delimiter: Delimiter; score: number } = { delimiter: ',', score: -1 }
  for (const delimiter of ['\t', ',', ';'] as Delimiter[]) {
    const counts = splitDelimited(sample, delimiter)
      .filter((r) => !isBlankRow(r))
      .map((r) => r.length)
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
 *  real header row. In a table of several columns, a leading row with only one cell filled is one
 *  of those, not data — drop them so the header detection looks at the real header. */
function dropLeadingTitleRows(rows: string[][]): { rows: string[][]; skipped: number } {
  const widest = Math.max(0, ...rows.map(filledCount))
  if (widest < 2) return { rows, skipped: 0 }
  let skipped = 0
  while (skipped < rows.length - 1 && filledCount(rows[skipped]) <= 1) skipped++
  return { rows: rows.slice(skipped), skipped }
}

export function parseDelimited(text: string): ParsedSheet {
  const clean = text.replace(/^﻿/, '')
  const delimiter = sniffDelimiter(clean)
  const all = splitDelimited(clean, delimiter).filter((r) => !isBlankRow(r))
  const { rows, skipped } = dropLeadingTitleRows(all)
  // Pad every row to the widest, so a row missing trailing cells still lines up with the columns.
  const width = Math.max(0, ...rows.map((r) => r.length))
  return { rows: rows.map((r) => [...r, ...Array(width - r.length).fill('')]), delimiter, skippedLeadingRows: skipped }
}

const normalizeHeader = (h: string): string => (h.trim() === '#' ? '#' : h.toLowerCase().replace(/[^a-z0-9#]/g, ''))

const HEADER_SYNONYMS: Record<Exclude<ColumnField, 'ignore' | 'type' | 'category'>, string[]> = {
  name: ['name', 'model', 'mic', 'mics', 'microphone', 'item', 'description', 'gear', 'equipment', 'unit', 'micmodel',
    'modelname', 'product', 'modelnumber', 'itemname', 'gearname', 'device'],
  manufacturer: ['manufacturer', 'brand', 'make', 'mfr', 'mfg', 'maker', 'company', 'vendor', 'manuf', 'brandname'],
  quantity: ['qty', 'quantity', 'count', 'number', 'num', '#', 'amount', 'units', 'pcs', 'channels', 'ch', 'chs',
    'howmany', 'onhand', 'stock', 'numberofunits', 'total']
}
const CATEGORY_HEADERS = ['category', 'cat', 'class', 'group', 'pattern', 'polarpattern', 'style', 'capsule', 'subcategory']
const TYPE_HEADERS = ['type', 'kind', 'geartype', 'section', 'department', 'itemtype', 'equipmenttype']

function headerField(header: string): ColumnField | 'typeish' | null {
  const h = normalizeHeader(header)
  if (!h) return null
  for (const [field, words] of Object.entries(HEADER_SYNONYMS)) if (words.includes(h)) return field as ColumnField
  if (CATEGORY_HEADERS.includes(h)) return 'category'
  if (TYPE_HEADERS.includes(h)) return 'typeish'
  return null
}

/** True when row 1 reads as a header row: any of its cells is a column name this recognizes. */
export function guessHasHeader(rows: string[][]): boolean {
  return rows.length > 0 && rows[0].some((c) => headerField(c) != null)
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

/** A first guess at what each column holds. Each field goes to at most one column, and anything
 *  unrecognized is left out ("Don't import") rather than guessed at. */
export function guessMapping(header: string[] | null, dataRows: string[][]): ColumnGuess[] {
  const width = Math.max(header?.length ?? 0, ...dataRows.map((r) => r.length), 0)
  const guesses: ColumnGuess[] = Array.from({ length: width }, () => ({ field: 'ignore', uncertain: false }))
  const taken = new Set<ColumnField>()
  const column = (i: number): string[] => dataRows.map((r) => r[i] ?? '').filter((v) => v !== '')
  const assign = (i: number, field: ColumnField, uncertain: boolean): void => {
    if (field === 'ignore' || taken.has(field) || guesses[i].field !== 'ignore') return
    guesses[i] = { field, uncertain }
    taken.add(field)
  }

  if (header) {
    header.forEach((h, i) => {
      const f = headerField(h)
      if (f && f !== 'typeish') assign(i, f, false)
    })
    // "Type" is ambiguous: mic / outboard / preamp, or Condenser / Dynamic? Decide by the values.
    header.forEach((h, i) => {
      if (headerField(h) !== 'typeish') return
      const values = column(i)
      const kinds = values.filter((v) => parseGearKind(v) != null).length
      assign(i, values.length > 0 && kinds / values.length >= 0.6 ? 'type' : 'category', true)
    })
  } else {
    // No header: a column of counts is the quantity, and the first text column is most likely the
    // name. Both are flagged — without a header they are only guesses.
    for (let i = 0; i < width; i++) {
      const values = column(i)
      if (values.length > 0 && values.every((v) => !parseCount(v).note)) {
        assign(i, 'quantity', true)
        break
      }
    }
    for (let i = 0; i < width; i++) {
      if (guesses[i].field === 'ignore' && column(i).length > 0) {
        assign(i, 'name', true)
        break
      }
    }
  }
  return guesses
}

const BLANK_COUNT = ['', '—', '–', '-', 'n/a', 'na']

/** "2", "2x", "x2", "2 pcs", "8 ch" → the number. A blank reads as 1 (a listed item is at least
 *  one), with a note. Anything else is counted as 1 and flagged, so one odd cell doesn't cost the
 *  row. Zero is its own answer — the caller skips the row. */
export function parseCount(raw: string): { value: number; note?: string } {
  const v = raw.trim().toLowerCase()
  if (BLANK_COUNT.includes(v)) return { value: 1, note: 'blank quantity counted as 1' }
  const m = /^(?:x\s*)?(\d+)\s*(?:x|pcs?|pieces?|units?|ea|each|ch|chs|channels?)?\.?$/.exec(v)
  if (m) return { value: Number(m[1]) }
  return { value: 1, note: `couldn't read quantity "${raw.trim()}" — counted as 1` }
}

const TOTALS = ['total', 'totals', 'sum', 'grandtotal', 'subtotal']

export interface ImportRow {
  /** 1-based line in the sheet as the user sees it, for pointing at a problem row. */
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

/** Turns the data rows into gear, using the mapping the user confirmed. `knownManufacturers` (every
 *  maker already in the app's catalogue) lets a name like "Neumann U 87 Ai" be split when the file
 *  has no manufacturer column. */
export function buildImportRows(
  dataRows: string[][],
  mapping: ColumnField[],
  kindMode: KindMode,
  knownManufacturers: string[],
  firstRowNumber: number
): ImportRow[] {
  const col = (field: ColumnField): number => mapping.indexOf(field)
  const [nameCol, mfrCol, catCol, qtyCol, typeCol] = (['name', 'manufacturer', 'category', 'quantity', 'type'] as const).map(col)
  // Longest first, so "Universal Audio" wins over a maker called "Universal".
  const makers = [...new Set(knownManufacturers.map((m) => m.trim()).filter(Boolean))].sort((a, b) => b.length - a.length)

  return dataRows.map((row, i) => {
    const cell = (c: number): string => (c >= 0 ? (row[c] ?? '').trim() : '')
    const notes: string[] = []
    let name = cell(nameCol)
    let manufacturer: string | null = cell(mfrCol) || null
    if (mfrCol < 0 && name) {
      const maker = makers.find((m) => name.toLowerCase().startsWith(m.toLowerCase() + ' '))
      if (maker) {
        manufacturer = maker
        name = name.slice(maker.length).trim()
        notes.push(`manufacturer ${maker} taken from the name`)
      }
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

    return {
      rowNumber: firstRowNumber + i,
      kind,
      name,
      manufacturer,
      category: cell(catCol) || null,
      count,
      notes,
      skipReason
    }
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

/** One identity per physical model: mics through canonicalMicKey, so a retired spelling (AT-4050)
 *  matches the current one (AT4050); everything else through gearIdentityKey. Kind is part of it —
 *  a mic and an outboard box never merge. */
function identity(kind: GearKind, name: string, manufacturer: string | null): string {
  return `${kind}:${kind === 'mic' ? canonicalMicKey(manufacturer, name) : gearIdentityKey(name, manufacturer)}`
}

/** Merges the readable rows into one item per model — repeated rows add their counts, and a model
 *  the studio already lists adds to that row — so an import never leaves "SM57" on the page twice. */
export function planImport(rows: ImportRow[], existing: ExistingGear[]): PlannedItem[] {
  const existingById = new Map<string, ExistingGear>()
  for (const e of existing) {
    const id = identity(e.kind, e.name, e.manufacturer)
    if (!existingById.has(id)) existingById.set(id, e)
  }
  const planned = new Map<string, PlannedItem>()
  for (const row of rows) {
    if (row.skipReason || !row.kind) continue
    const id = identity(row.kind, row.name, row.manufacturer)
    const item = planned.get(id)
    if (item) {
      item.count += row.count
      item.rowNumbers.push(row.rowNumber)
      for (const note of row.notes) if (!item.notes.includes(note)) item.notes.push(note)
      item.category = item.category ?? row.category
      continue
    }
    const target = existingById.get(id)
    planned.set(id, {
      kind: row.kind,
      name: row.name,
      manufacturer: row.manufacturer,
      category: row.category,
      count: row.count,
      rowNumbers: [row.rowNumber],
      notes: [...row.notes],
      target: target
        ? {
            key: target.key,
            existingCount: target.count,
            spelledAs: target.name.trim().toLowerCase() === row.name.trim().toLowerCase() ? null : target.name
          }
        : null
    })
  }
  return [...planned.values()]
}
