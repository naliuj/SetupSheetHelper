import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

/** The size a layout image will report in the renderer — Chromium's `naturalWidth` and
 *  `naturalHeight` — read from the file itself, for migration 045, which has to know it without a
 *  browser to ask. It must agree with Chromium exactly, or the blocks it rescales land beside the
 *  drawing instead of on it; so anything it isn't sure of comes back null, and the caller leaves
 *  that layout alone.
 *
 *  Covers every type the layout picker accepts except PDF (see LAYOUT_FILE_EXTENSIONS), which
 *  never needed this: PDFs have always been drawn at a fixed 144 px/in. */
export function readImageSize(path: string): { width: number; height: number } | null {
  let buf: Buffer
  try {
    buf = readFileSync(path)
  } catch {
    return null
  }
  try {
    const size = extname(path).toLowerCase() === '.svg' ? svgSize(buf.toString('utf8')) : rasterSize(buf)
    return size && size.width > 0 && size.height > 0 ? size : null
  } catch {
    // A truncated or corrupt file reads past its end — not an error worth stopping a migration for.
    return null
  }
}

function rasterSize(b: Buffer): { width: number; height: number } | null {
  // PNG: the IHDR chunk always comes first.
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString('latin1', 12, 16) === 'IHDR') {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  }
  // GIF: the logical screen descriptor.
  if (b.length >= 10 && b.toString('latin1', 0, 4) === 'GIF8') {
    return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
  }
  // BMP: the DIB header. Negative height means stored top-down; the image is the same size.
  if (b.length >= 26 && b.toString('latin1', 0, 2) === 'BM') {
    const dibSize = b.readUInt32LE(14)
    if (dibSize === 12) return { width: b.readUInt16LE(18), height: b.readUInt16LE(20) }
    return { width: Math.abs(b.readInt32LE(18)), height: Math.abs(b.readInt32LE(22)) }
  }
  // WebP: lossy (VP8), lossless (VP8L) or extended (VP8X).
  if (b.length >= 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = b.toString('latin1', 12, 16)
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
    if (chunk === 'VP8L') {
      const b1 = b[22]
      const b2 = b[23]
      const b3 = b[24]
      return { width: 1 + (b[21] | ((b1 & 0x3f) << 8)), height: 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) }
    }
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }
    return null
  }
  // JPEG.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) return jpegSize(b)
  return null
}

/** Walks the JPEG's segments for its frame size, and for the EXIF orientation: Chromium turns a
 *  photo upright before reporting its size, so a portrait phone photo stored sideways (orientation
 *  5-8) reports its width and height swapped. Getting that wrong would rescale every block on it by
 *  the wrong factor. */
function jpegSize(b: Buffer): { width: number; height: number } | null {
  let orientation = 1
  let offset = 2
  while (offset + 4 <= b.length) {
    if (b[offset] !== 0xff) return null
    const marker = b[offset + 1]
    // Fill bytes and standalone markers carry no length.
    if (marker === 0xff) {
      offset += 1
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const length = b.readUInt16BE(offset + 2)
    const body = offset + 4
    if (marker === 0xe1 && b.toString('latin1', body, body + 6) === 'Exif\0\0') {
      orientation = exifOrientation(b, body + 6) ?? orientation
    }
    // Start-of-frame markers — every C0-CF except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = b.readUInt16BE(body + 1)
      const width = b.readUInt16BE(body + 3)
      return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height }
    }
    offset = offset + 2 + length
  }
  return null
}

/** The Orientation tag (0x0112) from a TIFF header starting at `tiff`, or null. */
function exifOrientation(b: Buffer, tiff: number): number | null {
  const little = b.toString('latin1', tiff, tiff + 2) === 'II'
  const u16 = (at: number): number => (little ? b.readUInt16LE(at) : b.readUInt16BE(at))
  const u32 = (at: number): number => (little ? b.readUInt32LE(at) : b.readUInt32BE(at))
  const ifd = tiff + u32(tiff + 4)
  const count = u16(ifd)
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12
    if (u16(entry) === 0x0112) return u16(entry + 8)
  }
  return null
}

/** CSS pixels per unit, the conversion Chromium applies to an SVG's absolute width and height. */
const SVG_UNITS: Record<string, number> = { '': 1, px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 }

/** An SVG's size from absolute `width` and `height` on its root element. Anything relative (a
 *  percentage, `em`) or missing — including a viewBox-only drawing — returns null: Chromium's answer
 *  for those depends on rules not worth reimplementing, and a wrong guess would misplace blocks. */
function svgSize(text: string): { width: number; height: number } | null {
  const root = /<svg\b[^>]*>/i.exec(text)?.[0]
  if (!root) return null
  const attr = (name: string): number | null => {
    // (?:^|\s) so `stroke-width` or `data-width` can't match `width`.
    const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']\\s*([0-9]*\\.?[0-9]+)\\s*(px|pt|pc|in|cm|mm)?\\s*["']`, 'i').exec(
      root
    )
    if (!m) return null
    return Number(m[1]) * SVG_UNITS[(m[2] ?? '').toLowerCase()]
  }
  const width = attr('width')
  const height = attr('height')
  return width != null && height != null ? { width: Math.round(width), height: Math.round(height) } : null
}
