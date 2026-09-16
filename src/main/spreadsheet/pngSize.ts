const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Pixel dimensions of a PNG, read straight out of its IHDR header.
 *
 *  exceljs takes an image and an on-sheet size but never tells you the source's natural size, and
 *  the pop-out Layout window's relay hands back only a data URL — so threading the dimensions
 *  through IPC would mean two sources of truth for one fact. The PDF export gets this free from
 *  pdf-lib's `embedPng().size()`; this is the equivalent for the spreadsheet.
 *
 *  IHDR is mandatory and must be the first chunk, so width and height sit at fixed offsets: the
 *  8-byte signature, a 4-byte length and a 4-byte type, then width and height as big-endian u32. */
export function pngSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a PNG: the layout capture is missing its PNG signature')
  }
  if (bytes.subarray(12, 16).toString('latin1') !== 'IHDR') {
    throw new Error('Malformed PNG: IHDR is not the first chunk of the layout capture')
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}
