// Writes one downloadable studio pack per Berklee room, in exactly the shape
// src/main/studios/exportImport.ts produces, for publishing on the companion site's Studio
// Downloads page. Each file is a standalone { version, studios: [...] } that Import Studios
// accepts as-is.
//
// Uses node:sqlite rather than better-sqlite3 on purpose: better-sqlite3 in this repo is compiled
// for Electron's ABI, so a plain-node script would need a rebuild to Node and back again, which is
// the exact dance that keeps breaking `npm run dev`. node:sqlite ships with Node 22.5+ and needs
// nothing.
//
// Usage: node scripts/export_berklee_studio_packs.cjs <path-to-sqlite> <output-dir>

const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const path = require('node:path')

const EXPORT_VERSION = 3

const [dbPath, outDir] = process.argv.slice(2)
if (!dbPath || !outDir) {
  console.error('Usage: node scripts/export_berklee_studio_packs.cjs <path-to-sqlite> <output-dir>')
  process.exit(1)
}

const db = new DatabaseSync(dbPath, { readOnly: true })
fs.mkdirSync(outDir, { recursive: true })

// Berklee rooms only: a studio with a building is institutional, one without is user-created.
const studios = db
  .prepare(
    `SELECT s.id, s.name, b.name AS building
       FROM studios s JOIN buildings b ON b.id = s.building_id
      ORDER BY s.id`
  )
  .all()

const gear = (table, cols) =>
  db.prepare(`SELECT ${cols} FROM ${table} WHERE pool_type = 'studio' AND studio_id = ? ORDER BY sort_order, name`)

const micsFor = gear('mics', 'name, manufacturer, category, quantity')
const outboardFor = gear('outboard_gear', 'name, manufacturer, category, quantity')
const preampsFor = gear('preamps', 'name, manufacturer, category, channels')
const layoutFor = db.prepare(
  'SELECT file_path, original_name, page_width_pt, page_height_pt FROM room_layout_files WHERE studio_id = ?'
)

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const written = []
for (const studio of studios) {
  const layout = layoutFor.get(studio.id)
  let roomLayoutFile = null
  if (layout && fs.existsSync(layout.file_path)) {
    roomLayoutFile = {
      originalName: layout.original_name,
      extension: path.extname(layout.file_path).toLowerCase(),
      pageWidthPt: layout.page_width_pt,
      pageHeightPt: layout.page_height_pt,
      dataBase64: fs.readFileSync(layout.file_path).toString('base64')
    }
  }

  // Named for the archive, not for the app's own sidebar: an imported studio lands beside the
  // user's own rooms, where a bare "Studio A" says nothing about whose Studio A it is.
  const name = `Berklee ${studio.building}, ${studio.name}`
  const pack = {
    version: EXPORT_VERSION,
    studios: [
      {
        name,
        mics: micsFor.all(studio.id),
        outboardGear: outboardFor.all(studio.id),
        preamps: preampsFor.all(studio.id),
        roomLayoutFile
      }
    ]
  }

  const file = path.join(outDir, `${slug(name)}.json`)
  fs.writeFileSync(file, JSON.stringify(pack, null, 2) + '\n')
  const s = pack.studios[0]
  written.push({ file, name, mics: s.mics.length, outboard: s.outboardGear.length, preamps: s.preamps.length, layout: !!roomLayoutFile })
}

for (const w of written) {
  console.log(
    `${path.basename(w.file).padEnd(34)} ${String(w.mics).padStart(3)} mics  ${String(w.outboard).padStart(3)} outboard  ${String(w.preamps).padStart(2)} preamps  ${w.layout ? 'layout' : '      '}  ${(fs.statSync(w.file).size / 1024).toFixed(0)} KB`
  )
}
console.log(`\n${written.length} packs written to ${outDir}`)
db.close()
