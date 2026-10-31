import { readFileSync } from 'node:fs'
import { PATCHBAY_RENDER_SCALE, type PatchPoint } from '@shared/types/patchbay'

/** Bump when the detection rules change, so cached jack maps (patchbay_files.points_json) are
 *  re-detected on next load. */
export const PATCH_POINTS_VERSION = 1

/** One text item from the PDF's text layer, in PDF points (origin bottom-left, y = baseline). */
export interface TextToken {
  text: string
  x: number
  y: number
  width: number
  height: number
}

/** A filled rectangle from the drawing, in PDF points — the colored box behind a strip heading. */
export interface FilledBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface Line {
  y: number
  height: number
  tokens: (TextToken & { cx: number })[]
}

/** A run of consecutive numbered jacks in one line ("1 2 3 … 32") — the column grid every other
 *  strip in the same bay lines up with. */
interface GridRun {
  lineIndex: number
  y: number
  height: number
  columns: number[]
  spacing: number
  minX: number
  maxX: number
  /** A grid read from one unnumbered line's own evenly spaced labels ("IN IN IN"), used only for
   *  that line — other lines keep snapping to numbered strips. */
  ownLineOnly: boolean
}

const NUMBER = /^\d{1,3}$/
const ROW_NAME = /^[A-Z]{1,3}$/
const RULE = /[—–_]{3,}/
/** How far (in line heights) a heading or caption can sit from the strip it names. */
const HEADING_REACH = 2.4

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** Text items sharing a baseline, top of the page first. */
function groupLines(tokens: TextToken[]): Line[] {
  const sorted = [...tokens].sort((a, b) => b.y - a.y)
  const lines: Line[] = []
  for (const t of sorted) {
    const last = lines[lines.length - 1]
    const token = { ...t, text: t.text.trim(), cx: t.x + t.width / 2 }
    if (last && Math.abs(last.y - t.y) <= Math.max(0.35 * t.height, 0.5)) last.tokens.push(token)
    else lines.push({ y: t.y, height: t.height, tokens: [token] })
  }
  for (const line of lines) {
    line.tokens.sort((a, b) => a.cx - b.cx)
    line.height = median(line.tokens.map((t) => t.height))
  }
  return lines
}

function findGridRuns(lines: Line[]): GridRun[] {
  const runs: GridRun[] = []
  lines.forEach((line, lineIndex) => {
    const numbers = line.tokens.filter((t) => NUMBER.test(t.text))
    if (numbers.length < 6) return
    const gaps = numbers.slice(1).map((t, i) => t.cx - numbers[i].cx)
    const typical = median(gaps)
    if (typical <= 0) return
    // Numbers with other text between them aren't a numbered strip — they're pair names
    // ("L 1 R  L 2 R"), and would read as a false grid at twice the real spacing.
    const interrupted = (a: Line['tokens'][number], b: Line['tokens'][number]): boolean =>
      line.tokens.some((t) => t.cx > a.cx && t.cx < b.cx && !NUMBER.test(t.text) && t.text.trim() !== '|')
    // Split where a gap is far wider than the line's usual spacing — two bays drawn side by side.
    let start = 0
    for (let i = 1; i <= numbers.length; i++) {
      if (
        i < numbers.length &&
        numbers[i].cx - numbers[i - 1].cx <= typical * 1.8 &&
        !interrupted(numbers[i - 1], numbers[i])
      )
        continue
      const run = numbers.slice(start, i)
      start = i
      if (run.length < 6) continue
      const steps = run.slice(1).filter((t, j) => Number(t.text) === Number(run[j].text) + 1).length
      if (steps / (run.length - 1) < 0.7) continue
      const columns = run.map((t) => t.cx)
      const spacing = median(columns.slice(1).map((x, j) => x - columns[j]))
      runs.push({
        lineIndex,
        y: line.y,
        height: line.height,
        columns,
        spacing,
        minX: columns[0] - spacing / 2,
        maxX: columns[columns.length - 1] + spacing / 2,
        ownLineOnly: false
      })
    }
  })
  return runs
}

/** Grids for lines of short labels at a steady pitch with no numbered strip of their own —
 *  outboard rows like "IN IN IN" over device names. A column left blank shows up as a gap of two or
 *  three steps and is filled in. Stretches of a line already covered by a numbered grid are left to
 *  it (one line can cross several bays). */
function findLabelRuns(lines: Line[], numbered: GridRun[]): GridRun[] {
  const runs: GridRun[] = []
  lines.forEach((line, lineIndex) => {
    const covered = numbered.filter((r) => r.lineIndex === lineIndex)
    const tokens = line.tokens.filter((t) => t.text.trim().length <= 6)
    if (tokens.length < 6 || tokens.length < line.tokens.length * 0.8) return
    const gaps = tokens.slice(1).map((t, i) => t.cx - tokens[i].cx)
    const step = median(gaps)
    if (step <= line.height) return // letter-spaced text, not columns
    let start = 0
    for (let i = 1; i <= tokens.length; i++) {
      const multiple = i < tokens.length ? gaps[i - 1] / step : Infinity
      if (Math.abs(multiple - Math.round(multiple)) <= 0.12 && Math.round(multiple) >= 1 && Math.round(multiple) <= 3)
        continue
      const run = tokens.slice(start, i)
      start = i
      if (run.length < 6 || run.some((t) => t.width > step * 0.9)) continue
      if (covered.some((r) => run[0].cx <= r.maxX && run[run.length - 1].cx >= r.minX)) continue
      const count = Math.round((run[run.length - 1].cx - run[0].cx) / step) + 1
      const columns = Array.from({ length: count }, (_, k) => run[0].cx + k * step)
      runs.push({
        lineIndex,
        y: line.y,
        height: line.height,
        columns,
        spacing: step,
        minX: columns[0] - step / 2,
        maxX: columns[columns.length - 1] + step / 2,
        ownLineOnly: true
      })
    }
  })
  return runs
}

/** The grid a token lines up with: a run with a similar font size whose span covers it, nearest in
 *  height on the page. */
function runFor(
  token: { cx: number; height: number },
  lineIndex: number,
  lineY: number,
  runs: GridRun[]
): GridRun | null {
  let best: GridRun | null = null
  for (const run of runs) {
    if (run.ownLineOnly && run.lineIndex !== lineIndex) continue
    const ratio = token.height / run.height
    if (ratio < 0.75 || ratio > 1.33) continue
    if (token.cx < run.minX || token.cx > run.maxX) continue
    if (!best || Math.abs(run.y - lineY) < Math.abs(best.y - lineY)) best = run
  }
  return best
}

interface SnappedColumn {
  run: GridRun
  column: number
  /** Text sitting on this jack ("L", "12"). */
  own: { text: string; cx: number }[]
  /** Text drawn halfway between this jack and a neighbor — a stereo pair's name ("L STA R"). */
  shared: { text: string; cx: number }[]
}

/** Snaps a line's labels onto its bay's column grid. A label close to a column is that jack's own;
 *  one sitting about halfway between two columns names the pair, and is shared by both. Only
 *  columns with a label of their own become jacks. */
function snapLine(line: Line, lineIndex: number, runs: GridRun[]): Map<string, SnappedColumn> {
  const columns = new Map<string, SnappedColumn>()
  const entry = (run: GridRun, column: number): SnappedColumn => {
    const key = `${runs.indexOf(run)}:${column}`
    const existing = columns.get(key)
    if (existing) return existing
    const created: SnappedColumn = { run, column, own: [], shared: [] }
    columns.set(key, created)
    return created
  }
  const shared: {
    run: GridRun
    columns: number[]
    text: string
    cx: number
  }[] = []
  for (const token of line.tokens) {
    const run = runFor(token, lineIndex, line.y, runs)
    // A jack label fits its column; anything wider is a heading or a ruled caption spanning many.
    if (!run || token.width > run.spacing * 1.5) continue
    let column = 0
    for (let i = 1; i < run.columns.length; i++) {
      if (Math.abs(run.columns[i] - token.cx) < Math.abs(run.columns[column] - token.cx)) column = i
    }
    const distance = Math.abs(run.columns[column] - token.cx)
    const text = token.text.trim()
    if (distance <= run.spacing * 0.3) {
      entry(run, column).own.push({ text, cx: token.cx })
    } else if (distance <= run.spacing * 0.7) {
      const other = token.cx > run.columns[column] ? column + 1 : column - 1
      shared.push({ run, columns: [column, other], text, cx: token.cx })
    }
  }
  for (const caption of shared) {
    for (const column of caption.columns) {
      const key = `${runs.indexOf(caption.run)}:${column}`
      columns.get(key)?.shared.push({ text: caption.text, cx: caption.cx })
    }
  }
  return columns
}

const joined = (parts: { text: string; cx: number }[]): string =>
  [...parts]
    .sort((a, b) => a.cx - b.cx)
    .map((p) => p.text)
    .join(' ')

/** Phrases in a strip's heading line. Headings are often letter-spaced ("M I C   T I E   L I N E"),
 *  so the line's usual gap between letters sets the scale: a gap somewhat wider than that starts a
 *  new word, and a much wider one a new phrase. Ruled captions ("——— AUDIO DAW LINE IN ———") lose
 *  their rules. */
function headingPhrases(line: Line): { text: string; minX: number; maxX: number }[] {
  const tokens = line.tokens
    .map((t) => ({ ...t, text: t.text.replace(/[—–_-]{2,}/g, ' ').trim() }))
    .filter((t) => t.text)
  // Measured between single letters only: a heading of whole words has no letter spacing to learn.
  const gaps = tokens
    .slice(1)
    .map((t, i) => (t.text.length === 1 && tokens[i].text.length === 1 ? t.x - (tokens[i].x + tokens[i].width) : 0))
  const letterGap = Math.max(median(gaps.filter((g) => g > 0)), line.height * 0.2)
  const phrases: { text: string; minX: number; maxX: number }[] = []
  let words: string[] = []
  let word = ''
  let minX = 0
  let prevRight = -Infinity
  const flush = (): void => {
    if (word) words.push(word)
    if (words.length > 0) phrases.push({ text: words.join(' '), minX, maxX: prevRight })
    words = []
    word = ''
  }
  for (const t of tokens) {
    const gap = t.x - prevRight
    if (gap > Math.max(letterGap * 4, line.height * 2)) {
      flush()
      minX = t.x
    } else if (gap > letterGap * 1.6) {
      if (word) words.push(word)
      word = ''
    }
    // A multi-letter item is a word of its own, not letters to run together.
    if (t.text.length > 1 && word) {
      words.push(word)
      word = ''
    }
    word += t.text
    if (t.text.length > 1) {
      words.push(word)
      word = ''
    }
    prevRight = t.x + t.width
  }
  flush()
  return phrases
}

/** A strip heading's phrases, each with the colored box drawn behind it when there is one. Text
 *  is grouped by the smallest heading-height filled rectangle around it, so neighboring boxes
 *  ("STU OUT" | "EXT STU IN") stay separate even when their words sit close together. The box,
 *  not the text, says which jacks a heading covers — text is centered in its box, so a jack at a
 *  box's edge is often nearer the neighboring heading's words. Text outside any box falls back to
 *  gap-based phrases. */
function headingSections(
  line: Line,
  boxes: FilledBox[]
): { text: string; minX: number; maxX: number; box: FilledBox | null }[] {
  const cy = line.y + line.height * 0.35
  const area = (b: FilledBox): number => (b.maxX - b.minX) * (b.maxY - b.minY)
  const groups = new Map<FilledBox | null, Line['tokens']>()
  for (const token of line.tokens) {
    let box: FilledBox | null = null
    for (const b of boxes) {
      if (token.cx < b.minX || token.cx > b.maxX || cy < b.minY || cy > b.maxY) continue
      if (b.maxY - b.minY > line.height * 4) continue
      if (!box || area(b) < area(box)) box = b
    }
    groups.set(box, [...(groups.get(box) ?? []), token])
  }
  const sections: {
    text: string
    minX: number
    maxX: number
    box: FilledBox | null
  }[] = []
  for (const [box, tokens] of groups) {
    const phrases = headingPhrases({ ...line, tokens })
    if (box) {
      // One box can carry the same heading more than once (a full-width strip labeled in each
      // half); split it between its phrases at the midpoints.
      phrases.forEach((p, i) => {
        const minX = i === 0 ? box.minX : (phrases[i - 1].maxX + p.minX) / 2
        const maxX = i === phrases.length - 1 ? box.maxX : (p.maxX + phrases[i + 1].minX) / 2
        sections.push({
          text: p.text,
          minX,
          maxX,
          box: { ...box, minX, maxX }
        })
      })
    } else {
      // A ruled caption ("——— STUDIO PANEL TIE AV-1 ———") draws its own extent: the rule runs
      // the width of the jacks it names.
      const ruled = tokens.filter((t) => RULE.test(t.text))
      for (const t of ruled) {
        const text = t.text.replace(/[—–_-]{2,}/g, ' ').trim()
        if (text)
          sections.push({
            text,
            minX: t.x,
            maxX: t.x + t.width,
            box: { minX: t.x, maxX: t.x + t.width, minY: t.y, maxY: t.y }
          })
      }
      const rest = tokens.filter((t) => !RULE.test(t.text))
      // A row of whole-word captions ("TLA  33609  EL8 DIST") names one unit each.
      const phrases = rest.every((t) => t.text.trim().length > 1)
        ? rest.map((t) => ({
            text: t.text.trim(),
            minX: t.x,
            maxX: t.x + t.width
          }))
        : headingPhrases({ ...line, tokens: rest })
      sections.push(...phrases.map((p) => ({ ...p, box: null })))
    }
  }
  return sections
}

/** A jack's 1-based position across its bay: counted from the leftmost column of any numbered strip
 *  drawn at the same spacing and font size that overlaps this one — so every strip in a bay counts
 *  from the same left edge, whatever its own labels say. */
function bayPosition(x: number, run: GridRun, runs: GridRun[]): number {
  let left = run.columns[0]
  for (const other of runs) {
    if (Math.abs(other.spacing - run.spacing) > run.spacing * 0.05) continue
    if (Math.abs(other.height - run.height) > run.height * 0.1) continue
    if (other.maxX < run.minX || other.minX > run.maxX) continue
    left = Math.min(left, other.columns[0])
  }
  return Math.round((x - left) / run.spacing) + 1
}

/** Finds the jacks on a patchbay drawing from its text layer.
 *
 *  Patchbay drawings are strips of labeled columns under a heading. A strip whose labels are
 *  consecutive numbers defines the column grid for its bay; strips labeled otherwise ("L R",
 *  "IN 1") are snapped onto the grid of the nearest numbered strip with the same span and font.
 *  A line counts as jacks when it's a numbered strip itself, or when a heading sits directly above
 *  it — which keeps headings and page titles from becoming jacks. Pure, so it can be tested
 *  against a PDF's extracted text without Electron. */
export function detectPatchPointsFromText(
  tokens: TextToken[],
  pageHeightPt: number,
  boxes: FilledBox[] = []
): PatchPoint[] {
  const lines = groupLines(tokens.filter((t) => t.text.trim() && t.height > 0))
  const numbered = findGridRuns(lines)
  if (numbered.length === 0) return []
  const runs = [...numbered, ...findLabelRuns(lines, numbered)]

  const snapped = lines.map((line, i) => snapLine(line, i, runs))
  const gridLines = new Set(numbered.map((r) => r.lineIndex))
  const overlaps = (a: Line, b: Line): boolean =>
    a.tokens[0].x <= b.tokens[b.tokens.length - 1].x + b.tokens[b.tokens.length - 1].width &&
    b.tokens[0].x <= a.tokens[a.tokens.length - 1].x + a.tokens[a.tokens.length - 1].width
  // A line that reads as a strip of jacks: numbered, on its own label grid, or with most of its text
  // sitting on columns. Device names under an outboard strip ("TLA 33609 EL8 DIST") can land on a
  // column or two by chance, which mustn't make the strip above them look like their heading.
  const labelRunLines = new Set(runs.filter((r) => r.ownLineOnly).map((r) => r.lineIndex))
  const isStripLike = (j: number): boolean => {
    if (gridLines.has(j) || labelRunLines.has(j)) return true
    const own = [...snapped[j].values()].filter((c) => c.own.length > 0)
    const ownTokens = own.reduce((n, c) => n + c.own.length, 0)
    return own.length >= 2 && ownTokens >= lines[j].tokens.length * 0.6
  }
  // The candidate line directly below this one (a heading's strip), if any.
  const stripBelow = (index: number): number | null => {
    const line = lines[index]
    for (let j = index + 1; j < lines.length; j++) {
      if (line.y - lines[j].y > line.height * HEADING_REACH) break
      if (isStripLike(j) && overlaps(line, lines[j])) return j
    }
    return null
  }
  // A heading says what a strip is, so it has a real word in it — unlike a normalling legend
  // ("NN NN HN …") drawn between a bay's top and bottom rows, whose numbers would otherwise pass
  // for a strip of jacks.
  const isHeading = (index: number): boolean =>
    !gridLines.has(index) && headingPhrases(lines[index]).some((p) => /[A-Za-z]{3,}/.test(p.text))
  // A line of nothing but row letters ("AA   AA   AA") sits beside a strip without describing it.
  // (A letter-spaced heading is all capital letters too, but packed close; row letters stand far
  // apart, one per bay across the page: "DD   DD   HH".)
  const isRowNames = (index: number): boolean => {
    const { tokens, height } = lines[index]
    if (!tokens.every((t) => ROW_NAME.test(t.text.trim()))) return false
    return tokens.slice(1).every((t, i) => t.x - (tokens[i].x + tokens[i].width) > height * 3)
  }
  const headingAbove = (index: number): number | null => {
    const line = lines[index]
    for (let j = index - 1; j >= 0; j--) {
      if (lines[j].y - line.y > line.height * HEADING_REACH) break
      if (isRowNames(j)) continue
      if (overlaps(line, lines[j])) return isHeading(j) ? j : null
    }
    return null
  }
  // Some drawings caption a strip underneath instead ("201 202 …" over "—— STUDIO PANEL TIE ——").
  // A caption that already heads the strip below it isn't also this one's.
  const headingBelow = (index: number): number | null => {
    const line = lines[index]
    for (let j = index + 1; j < lines.length; j++) {
      if (line.y - lines[j].y > line.height * HEADING_REACH) break
      if (isRowNames(j) || !overlaps(line, lines[j])) continue
      return isHeading(j) && stripBelow(j) == null ? j : null
    }
    return null
  }
  const headingFor = (index: number): number | null => headingAbove(index) ?? headingBelow(index)

  const points: PatchPoint[] = []
  let rowNumber = 0
  lines.forEach((line, index) => {
    const all = snapped[index]
    const columns = new Map([...all].filter(([, c]) => c.own.length > 0))
    if (columns.size < 2) return
    const isGrid = gridLines.has(index)
    if (headingFor(index) == null) return // nothing labels it as a strip
    if (!isGrid) {
      if (stripBelow(index) != null) return // a heading, not jacks
      const tokenCount = [...columns.values()].reduce((n, c) => n + c.own.length, 0)
      if (tokenCount > columns.size * 2.5) return // letter-spaced text, not one label per column
    }
    rowNumber++

    const ordered = [...columns.values()].sort((a, b) => a.run.columns[a.column] - b.run.columns[b.column])
    const firstX = ordered[0].run.columns[ordered[0].column]
    const spacing = ordered[0].run.spacing
    // A row letter drawn to the left of the strip (Studio A's "A", "B", … "NN").
    let rowName: string | null = null
    let bestGap = Infinity
    for (const other of lines) {
      if (Math.abs(other.y - line.y) > Math.max(line.height * 1.5, 5)) continue
      for (const t of other.tokens) {
        const right = t.x + t.width
        const gap = firstX - spacing * 0.3 - right
        if (!ROW_NAME.test(t.text.trim()) || gap < 0 || gap > spacing * 4) continue
        if (gap < bestGap) {
          bestGap = gap
          rowName = t.text.trim()
        }
      }
    }
    const heading = headingFor(index)
    const phrases = heading != null ? headingSections(lines[heading], boxes) : []
    const centerY = pageHeightPt - (line.y + line.height * 0.35)
    // Unboxed captions: the closest one within a column's width.
    const nearestCaption = (x: number): string | null => {
      let best: string | null = null
      let bestDistance = spacing
      for (const p of phrases) {
        if (p.box) continue
        const distance = x < p.minX ? p.minX - x : x > p.maxX ? x - p.maxX : 0
        if (distance <= bestDistance) {
          bestDistance = distance
          best = p.text
        }
      }
      return best
    }

    for (const column of ordered) {
      const x = column.run.columns[column.column]
      const own = joined(column.own)
      const pair = joined(column.shared)
      const row = rowName ?? `Row ${rowNumber}`
      // A numbered strip names its own jacks ("A33"). Elsewhere the jack is named by its position
      // in the bay, with what's printed on it as a hint ("DD11 · 1 L").
      const position = isGrid && NUMBER.test(own) ? own : String(bayPosition(x, column.run, runs))
      const name = rowName ? `${rowName}${position}` : `${row} · ${position}`
      const hint = [pair, own].filter((t) => t && t !== position).join(' ')
      const section = phrases.find((p) => p.box && x >= p.box.minX && x <= p.box.maxX)?.text ?? nearestCaption(x)
      points.push({
        id: `${index}:${runs.indexOf(column.run)}:${column.column}`,
        label: hint ? `${name} · ${hint}` : name,
        section,
        x: x * PATCHBAY_RENDER_SCALE,
        y: centerY * PATCHBAY_RENDER_SCALE
      })
    }
  })
  return points
}

type Matrix = [number, number, number, number, number, number]

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5]
]

/** The filled rectangles on a page, in page coordinates. Walks the operator list tracking the
 *  transform stack, and keeps each path's bounding box when the path is filled. Best effort: an
 *  unexpected operator shape just yields fewer boxes, which only costs section names. */
async function readFilledBoxes(
  page: {
    getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>
  },
  OPS: Record<string, number>
): Promise<FilledBox[]> {
  const { fnArray, argsArray } = await page.getOperatorList()
  const boxes: FilledBox[] = []
  const stack: Matrix[] = []
  let ctm: Matrix = [1, 0, 0, 1, 0, 0]
  let pending: FilledBox | null = null
  const fills = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke])
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]
    const args = argsArray[i] as unknown[]
    if (fn === OPS.save) stack.push(ctm)
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
    else if (fn === OPS.transform) ctm = multiply(ctm, args as Matrix)
    else if (fn === OPS.constructPath) {
      const minMax = args?.[2] as number[] | undefined
      if (!minMax || minMax.length < 4) {
        pending = null
        continue
      }
      const corners = [
        [minMax[0], minMax[1]],
        [minMax[2], minMax[3]],
        [minMax[0], minMax[3]],
        [minMax[2], minMax[1]]
      ].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]])
      pending = {
        minX: Math.min(...corners.map((c) => c[0])),
        maxX: Math.max(...corners.map((c) => c[0])),
        minY: Math.min(...corners.map((c) => c[1])),
        maxY: Math.max(...corners.map((c) => c[1]))
      }
    } else if (fills.has(fn)) {
      if (pending) boxes.push(pending)
      pending = null
    } else if (fn === OPS.endPath || fn === OPS.stroke || fn === OPS.clip || fn === OPS.eoClip) {
      pending = null
    }
  }
  return boxes
}

/** Reads page 1 of a patchbay PDF: its size in points and the jacks on it. Detection failures
 *  return no points rather than throwing — Patchbay Mode then places cable ends freely. */
export async function readPatchbayPdf(
  filePath: string
): Promise<{ widthPt: number; heightPt: number; points: PatchPoint[] }> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(readFileSync(filePath))
  }).promise
  try {
    const page = await doc.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    let points: PatchPoint[] = []
    try {
      const content = await page.getTextContent()
      const tokens: TextToken[] = []
      for (const item of content.items) {
        if (!('str' in item)) continue
        const [, , c, d, e, f] = item.transform as number[]
        tokens.push({
          text: item.str,
          x: e,
          y: f,
          width: item.width,
          height: Math.hypot(c, d)
        })
      }
      points = detectPatchPointsFromText(tokens, viewport.height, await readFilledBoxes(page, pdfjsLib.OPS))
    } catch {
      points = []
    }
    return { widthPt: viewport.width, heightPt: viewport.height, points }
  } finally {
    await doc.destroy()
  }
}
