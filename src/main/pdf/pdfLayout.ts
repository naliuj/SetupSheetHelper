import type { PDFFont } from 'pdf-lib'

// Pure layout math for the setup-sheet PDF table — no electron/db/pdf-document dependencies, so it
// can be unit-tested in plain node. exportSetupPdf.ts owns the actual drawing.

/** A column's natural (unfitted) width plus a floor it won't shrink below when auto-fitting. Text
 *  columns get generous floors so long content has room before wrapping; numeric columns stay tight. */
export interface ColumnSpec {
  key: string
  label: string
  width: number
  minWidth: number
}

export interface RenderColumn {
  key: string
  label: string
  width: number
}

// Text columns receive any leftover width when the table is narrower than the page (so long text
// gets more room before it wraps); numeric columns stay at their natural width.
const TEXT_COLUMN_KEYS = new Set(['sourceName', 'mic', 'outboard', 'notes'])

export function isTextColumn(key: string): boolean {
  return TEXT_COLUMN_KEYS.has(key)
}

/** Characters that have a sensible ASCII reading. Only characters WinAnsi genuinely cannot encode
 *  belong here — mapping one it can (bullet, ellipsis, en/em dash, the curly quotes) would
 *  needlessly degrade text that was already fine. */
const WINANSI_REPLACEMENTS = new Map<string, string>([
  ['\u2192', '->'],
  ['\u2190', '<-'],
  ['\u2194', '<->'],
  ['\u21d2', '=>'],
  ['\u2713', 'x'],
  ['\u2714', 'x'],
  ['\u2717', 'x'],
  ['\u2718', 'x'],
  ['\u26a0', '!'],
  ['\u2248', '~'],
  ['\u2264', '<='],
  ['\u2265', '>='],
  ['\u2260', '!='],
  ['\u266d', 'b'],
  ['\u266f', '#'],
  // Latin letters that do NOT decompose under NFKD, so the normalisation pass below cannot save
  // them. Polish and Croatian names are the realistic case.
  ['\u0142', 'l'],
  ['\u0141', 'L'],
  ['\u0111', 'd'],
  ['\u0110', 'D'],
  ['\u0131', 'i'],
  ['\u0127', 'h'],
  ['\u0126', 'H']
])

/** The 27 printable characters WinAnsi places in 0x80-0x9F, where Latin-1 has control codes. */
const WINANSI_HIGH_RANGE = new Set(
  '\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d' +
    '\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178'
)

function isWinAnsiEncodable(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  if (code >= 0x20 && code <= 0x7e) return true
  if (code >= 0xa0 && code <= 0xff) return true
  return WINANSI_HIGH_RANGE.has(ch)
}

/** Makes `text` safe to measure and draw in a WinAnsi-encoded font.
 *
 *  This is not cosmetic. pdf-lib throws on a character the encoding cannot represent, and it
 *  throws during MEASUREMENT — so one pasted arrow, one emoji, or one accented name anywhere in a
 *  setup aborts the whole export before a single byte is written, and the user gets no file at
 *  all rather than a file with an odd-looking character in it.
 *
 *  Three passes, cheapest first: a small map of characters with an obvious ASCII reading; NFKD
 *  normalisation, which splits an accented letter into a base letter plus a combining mark so
 *  "Dvořák" degrades to "Dvorak" rather than "Dvo?ak"; then '?' for anything still unencodable. */
export function sanitizeForWinAnsi(text: string): string {
  if (!text) return text

  let out = ''
  for (const ch of text) {
    if (isWinAnsiEncodable(ch)) {
      out += ch
      continue
    }
    const mapped = WINANSI_REPLACEMENTS.get(ch)
    if (mapped !== undefined) {
      out += mapped
      continue
    }
    // Strip combining marks left behind by the decomposition; if what remains is encodable, the
    // accented letter survives as its base letter.
    const decomposed = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    out += decomposed.length > 0 && [...decomposed].every(isWinAnsiEncodable) ? decomposed : '?'
  }
  return out
}

/** Greedy word-wrap: break `text` into lines that each fit within `maxWidth` at the given font/size.
 *  A single token longer than `maxWidth` is hard-broken character-by-character so nothing overflows. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return ['']
  const fits = (s: string): boolean => font.widthOfTextAtSize(s, size) <= maxWidth
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (fits(candidate)) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      // The word itself may still be wider than the column — hard-break it.
      if (fits(word)) {
        line = word
      } else {
        let chunk = ''
        for (const ch of word) {
          if (fits(chunk + ch)) {
            chunk += ch
          } else {
            if (chunk) lines.push(chunk)
            chunk = ch
          }
        }
        line = chunk
      }
    }
    if (line) lines.push(line)
  }
  return lines.length > 0 ? lines : ['']
}

/** Scale/allot the visible columns to exactly fill `usableWidth`. Over-wide tables shrink
 *  proportionally (respecting each column's floor); narrow tables hand the slack to text columns. */
export function fitColumns(columns: ColumnSpec[], usableWidth: number): RenderColumn[] {
  const total = columns.reduce((w, c) => w + c.width, 0)

  if (total > usableWidth) {
    // Shrink toward each column's minWidth. Distribute the overflow across the shrinkable slack
    // (width - minWidth) so tight numeric columns keep their size and text columns give the most.
    const minTotal = columns.reduce((w, c) => w + c.minWidth, 0)
    const shrinkable = total - minTotal
    const overflow = total - usableWidth
    // If even the minimums don't fit (extreme column count), fall back to a flat proportional scale.
    if (shrinkable <= 0 || minTotal > usableWidth) {
      const scale = usableWidth / total
      return columns.map((c) => ({ key: c.key, label: c.label, width: c.width * scale }))
    }
    return columns.map((c) => {
      const slack = c.width - c.minWidth
      return { key: c.key, label: c.label, width: c.width - overflow * (slack / shrinkable) }
    })
  }

  const slack = usableWidth - total
  if (slack > 0) {
    // Pour all the leftover width into Notes — the free-form, usually-longest column — so the
    // fixed left-hand columns stay tight against their content instead of spreading across the
    // page and leaving big gaps after short entries like "D6". If Notes was omitted (blank
    // everywhere), fall back to spreading the slack across the other text columns.
    const hasNotes = columns.some((c) => c.key === 'notes')
    if (hasNotes) {
      return columns.map((c) => ({ key: c.key, label: c.label, width: c.key === 'notes' ? c.width + slack : c.width }))
    }
    const textCols = columns.filter((c) => isTextColumn(c.key))
    if (textCols.length > 0) {
      const per = slack / textCols.length
      return columns.map((c) => ({
        key: c.key,
        label: c.label,
        width: isTextColumn(c.key) ? c.width + per : c.width
      }))
    }
  }
  return columns.map((c) => ({ key: c.key, label: c.label, width: c.width }))
}
