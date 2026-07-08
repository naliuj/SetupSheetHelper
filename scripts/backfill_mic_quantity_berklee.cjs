// Sets real per-mic quantities for the 7 real Berklee studios (Studio 1/2/3, Studio A/A76/B/E),
// sourced from https://college.berklee.edu/mpe/our-studios and each studio's individual
// equipment-list page. Matched by DB row id (verified by hand against manufacturer+model name
// for each studio — the DB's mic rows already mirror these pages almost verbatim, just without
// quantities). Two rows (Studio 2's Avalon U5 and Radial JDI Passive) weren't present in the
// fetched page summary and are left at the safe default of 1 rather than guessed.
//
// Usage: node scripts/backfill_mic_quantity_berklee.cjs <path-to-sqlite-file>

const Database = require('better-sqlite3')

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('Usage: node scripts/backfill_mic_quantity_berklee.cjs <path-to-sqlite-file>')
  process.exit(1)
}

// id -> quantity, keyed per studio for readability.
const QUANTITIES = {
  // Studio 1 (Shames Family Scoring Stage)
  131: 1, 132: 6, 133: 2, 134: 1, 135: 2, 136: 2, 137: 1, 138: 1, 139: 1, 140: 2,
  141: 1, 142: 1, 143: 1, 144: 2, 145: 3, 146: 6, 147: 6, 148: 1, 149: 2, 150: 3,
  151: 6, 152: 1, 153: 2, 154: 6, 155: 8, 156: 2, 157: 2, 158: 4, 159: 4, 160: 4,
  161: 1, 162: 4, 163: 2, 164: 1, 165: 2, 166: 8, 167: 2, 168: 1, 169: 2, 170: 1,

  // Studio 2 (The Ark) — 181 (Avalon U5) and 195 (Radial JDI Passive) not in source summary,
  // left unset (defaulted to 1 by the earlier general backfill).
  171: 1, 172: 5, 173: 2, 174: 1, 175: 2, 176: 2, 177: 1, 178: 1, 179: 2, 180: 1,
  182: 2, 183: 1, 184: 1, 185: 2, 186: 3, 187: 4, 188: 4, 189: 1, 190: 4, 191: 3,
  192: 4, 193: 1, 194: 2, 196: 6, 197: 2, 198: 1, 199: 2, 200: 2, 201: 2, 202: 1,
  203: 4, 204: 1, 205: 1, 206: 8, 207: 2, 208: 2, 209: 2, 210: 1,

  // Studio 3 (The Bridge)
  211: 4, 212: 2, 213: 2, 214: 1, 215: 1, 216: 2, 217: 1, 218: 2, 219: 2, 220: 2,
  221: 4, 222: 1, 223: 4, 224: 2, 225: 2, 226: 2, 227: 4, 228: 6, 229: 1, 230: 2,
  231: 4, 232: 1, 233: 4, 234: 1, 235: 2, 236: 7, 237: 2, 238: 1, 239: 2, 240: 1,

  // Studio A
  1: 1, 2: 2, 3: 1, 4: 2, 5: 1, 6: 1, 7: 2, 8: 1, 9: 1, 10: 2,
  11: 2, 12: 2, 13: 2, 14: 1, 15: 1, 16: 2, 17: 2, 18: 2, 19: 2, 20: 2,
  21: 1, 22: 2, 23: 1, 24: 2, 25: 1, 26: 2, 27: 2, 28: 1, 29: 4, 30: 2,
  31: 1, 32: 1, 33: 1, 34: 2, 35: 4, 36: 1, 37: 2, 38: 1, 39: 2, 40: 2, 41: 1,

  // Studio A76 (Production Suite A76)
  118: 1, 119: 1, 120: 2, 121: 1, 122: 1, 123: 1, 124: 1, 125: 1, 126: 2, 127: 2,
  128: 3, 129: 3, 130: 1,

  // Studio B
  80: 1, 81: 2, 82: 2, 83: 2, 84: 2, 85: 1, 86: 1, 87: 2, 88: 2, 89: 2,
  90: 2, 91: 1, 92: 1, 93: 4, 94: 2, 95: 1, 96: 2, 97: 2, 98: 2, 99: 2,
  100: 2, 101: 2, 102: 2, 103: 1, 104: 2, 105: 2, 106: 2, 107: 3, 108: 2, 109: 1,
  110: 1, 111: 2, 112: 4, 113: 1, 114: 1, 115: 2, 116: 2, 117: 1,

  // Studio E
  42: 2, 43: 2, 44: 2, 45: 2, 46: 1, 47: 2, 48: 1, 49: 1, 50: 1, 51: 2,
  52: 2, 53: 2, 54: 2, 55: 2, 56: 2, 57: 1, 58: 1, 59: 1, 60: 1, 61: 2,
  62: 1, 63: 2, 64: 1, 65: 3, 66: 1, 67: 1, 68: 1, 69: 1, 70: 2, 71: 2,
  72: 1, 73: 4, 74: 3, 75: 1, 76: 1, 77: 1, 78: 2, 79: 1
}

// Not present in the fetched page summary for Studio 2 — default to 1 (the safe fallback used
// everywhere else) rather than guess an unverified count.
const UNVERIFIED_DEFAULTS = [181, 195]

console.log(`Applying Berklee-sourced quantities to: ${dbPath}`)

const db = new Database(dbPath)
const update = db.prepare('UPDATE mics SET quantity = ? WHERE id = ?')
const getRow = db.prepare('SELECT manufacturer, name, quantity FROM mics WHERE id = ?')

let updated = 0
let skipped = 0
for (const [idStr, quantity] of Object.entries(QUANTITIES)) {
  const id = Number(idStr)
  const row = getRow.get(id)
  if (!row) {
    console.warn(`  id ${id} not found in this DB, skipping`)
    skipped++
    continue
  }
  update.run(quantity, id)
  updated++
}

let defaulted = 0
for (const id of UNVERIFIED_DEFAULTS) {
  const row = getRow.get(id)
  if (!row) continue
  update.run(1, id)
  defaulted++
}

console.log(`Updated ${updated} rows from Berklee source data, defaulted ${defaulted} unverified row(s) to 1, skipped ${skipped} (not found).`)
console.log('Defaulted rows (not in the fetched page summary): 181 (Avalon U5, Studio 2), 195 (Radial JDI Passive, Studio 2)')

db.close()
console.log('done')
