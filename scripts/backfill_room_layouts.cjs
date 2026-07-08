// Copies the bundled Berklee room-layout PDFs (resources/layouts/) into an existing install's
// userData/layouts folder and inserts room_layout_pdfs rows — for installs where migration 2
// (002_seed_berklee_data.ts) already ran before the layout-seeding step was added, so it won't
// re-run automatically. Protects any studio that already has a REAL room_layout_pdfs row (a
// genuine prior import), but replaces/clears the "Julian Rose Resume.pdf" placeholder left over
// from earlier development testing wherever it's found — Studio A gets the real layout in its
// place; Studio A76 (no real layout available yet) just has the placeholder row removed.
//
// Usage: node scripts/backfill_room_layouts.cjs <path-to-sqlite-file> <path-to-userData-dir>

const Database = require('better-sqlite3')
const fs = require('node:fs')
const path = require('node:path')

const dbPath = process.argv[2]
const userDataDir = process.argv[3]
if (!dbPath || !userDataDir) {
  console.error('Usage: node scripts/backfill_room_layouts.cjs <path-to-sqlite-file> <path-to-userData-dir>')
  process.exit(1)
}

const PLACEHOLDER_NAME = 'Julian Rose Resume.pdf'

const BUNDLED_LAYOUTS = [
  { buildingName: '160', studioName: 'Studio 1', file: 'studio_1.pdf', widthPt: 871, heightPt: 569 },
  { buildingName: '160', studioName: 'Studio 2', file: 'studio_2.pdf', widthPt: 691, heightPt: 482 },
  { buildingName: '160', studioName: 'Studio 3', file: 'studio_3.pdf', widthPt: 757, heightPt: 506 },
  { buildingName: '150', studioName: 'Studio A', file: 'studio_a.pdf', widthPt: 792, heightPt: 612 },
  { buildingName: '150', studioName: 'Studio B', file: 'studio_b.pdf', widthPt: 612, heightPt: 792 },
  { buildingName: '150', studioName: 'Studio E', file: 'studio_e.pdf', widthPt: 612, heightPt: 792 }
]

const bundledDir = path.join(__dirname, '..', 'resources', 'layouts')
const layoutsDir = path.join(userDataDir, 'layouts')
fs.mkdirSync(layoutsDir, { recursive: true })

const db = new Database(dbPath)
const getStudioByName = db.prepare(
  `SELECT s.id FROM studios s JOIN buildings b ON b.id = s.building_id WHERE b.name = ? AND s.name = ?`
)
const getExistingLayout = db.prepare('SELECT id, file_path, original_name FROM room_layout_pdfs WHERE studio_id = ?')
const deleteLayout = db.prepare('DELETE FROM room_layout_pdfs WHERE studio_id = ?')
const insertLayout = db.prepare(
  `INSERT INTO room_layout_pdfs (studio_id, file_path, original_name, page_width_pt, page_height_pt)
   VALUES (?, ?, ?, ?, ?)`
)

function removePlaceholderFile(existing) {
  if (existing && fs.existsSync(existing.file_path)) fs.unlinkSync(existing.file_path)
}

let inserted = 0
let skipped = 0
for (const layout of BUNDLED_LAYOUTS) {
  const studio = getStudioByName.get(layout.buildingName, layout.studioName)
  if (!studio) {
    console.warn(`  studio not found: ${layout.buildingName}/${layout.studioName}, skipping`)
    skipped++
    continue
  }
  const existing = getExistingLayout.get(studio.id)
  if (existing && existing.original_name !== PLACEHOLDER_NAME) {
    console.log(`  ${layout.studioName} already has a real room layout, skipping`)
    skipped++
    continue
  }
  if (existing) {
    removePlaceholderFile(existing)
    deleteLayout.run(studio.id)
  }
  const sourcePath = path.join(bundledDir, layout.file)
  const destPath = path.join(layoutsDir, `studio_${studio.id}.pdf`)
  fs.copyFileSync(sourcePath, destPath)
  insertLayout.run(studio.id, destPath, layout.file, layout.widthPt, layout.heightPt)
  console.log(`  ${layout.studioName}: ${existing ? 'replaced placeholder' : 'inserted'} (studio_id=${studio.id})`)
  inserted++
}

// Studio A76 has no real layout available — just remove the resume placeholder if present,
// leaving it with no layout rather than junk data.
const a76 = getStudioByName.get('150', 'Studio A76')
if (a76) {
  const existing = getExistingLayout.get(a76.id)
  if (existing && existing.original_name === PLACEHOLDER_NAME) {
    removePlaceholderFile(existing)
    deleteLayout.run(a76.id)
    console.log('  Studio A76: removed resume placeholder (no real layout available yet)')
  }
}

console.log(`Inserted/replaced ${inserted} layout(s), skipped ${skipped}.`)
db.close()
console.log('done')
