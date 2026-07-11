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
