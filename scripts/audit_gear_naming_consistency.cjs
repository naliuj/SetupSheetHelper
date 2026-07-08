// Read-only audit: flags mics/outboard gear across Berklee studios (+ building/faculty-reserve
// pools) whose names look like the same physical piece of equipment formatted inconsistently
// (e.g. "AKG C414-XLII" vs "AKG C414 B-XL II"). Reports candidates for manual review only —
// does not modify anything.
const Database = require('better-sqlite3')
const path = require('node:path')
const os = require('node:os')

function getDbPath() {
  const platform = process.platform
  const appName = 'setup-sheet-helper'
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName, `${appName}.sqlite`)
  }
  if (platform === 'win32') {
    return path.join(process.env.APPDATA || '', appName, `${appName}.sqlite`)
  }
  return path.join(os.homedir(), '.config', appName, `${appName}.sqlite`)
}

const db = new Database(getDbPath(), { readonly: true })

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Strips a leading manufacturer name before extracting the model number, so a manufacturer
// name that itself contains digits (e.g. "Tech21") can't masquerade as a matching model
// number between two otherwise-unrelated products. Requires 2+ digits to cut down on
// coincidental single-digit matches (e.g. the "1" in both "PE-1C" and "CL-1B").
function extractModelNumber(name, manufacturer) {
  let rest = name
  if (manufacturer) {
    const escaped = manufacturer.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    rest = rest.replace(new RegExp(`^${escaped}\\s*`, 'i'), '')
  }
  const match = rest.match(/\d{2,}/)
  return match ? match[0] : null
}

function locationLabel(row) {
  if (row.studio_name) return row.studio_name
  if (row.building_name) return `Building Office (${row.building_name})`
  if (row.pool_type === 'faculty_reserve') return 'Faculty Reserve'
  return `pool:${row.pool_type}`
}

const mics = db
  .prepare(
    `SELECT m.id, m.name, m.manufacturer, m.pool_type, s.name AS studio_name, b.name AS building_name
     FROM mics m
     LEFT JOIN studios s ON s.id = m.studio_id
     LEFT JOIN buildings b ON b.id = m.building_id
     WHERE s.building_id IS NOT NULL OR m.pool_type IN ('building', 'faculty_reserve')`
  )
  .all()

const outboard = db
  .prepare(
    `SELECT o.id, o.name, o.manufacturer, o.pool_type, s.name AS studio_name, NULL AS building_name
     FROM outboard_gear o
     LEFT JOIN studios s ON s.id = o.studio_id
     WHERE s.building_id IS NOT NULL OR o.pool_type IN ('building', 'faculty_reserve')`
  )
  .all()

function analyze(rows) {
  const byManufacturer = new Map()
  for (const row of rows) {
    const mfr = (row.manufacturer || '').trim().toLowerCase() || '(no manufacturer)'
    if (!byManufacturer.has(mfr)) byManufacturer.set(mfr, [])
    byManufacturer.get(mfr).push(row)
  }

  // Tier 1: identical once punctuation/case/spacing is stripped — unambiguously the same
  // item, just formatted differently (e.g. "C535 EB" vs "C535EB"). Tier 2: same manufacturer
  // + same leading model number, but not identical — could be a formatting variant of the
  // same model (like the C414 example) or a genuinely different variant/generation (e.g. AKG's
  // own C414 XLS/XLII/EB are real distinct products) — needs a human who knows the gear.
  // Deliberately NOT using generic string-distance here: audio gear model numbers are often
  // adjacent catalog numbers for different real products (SM-57 vs SM-58, RE-15 vs RE-20,
  // Beta 52 vs Beta 91), so "close spelling" alone is unreliable and was producing false
  // positives on genuinely different equipment.
  const tier1 = []
  const tier2 = []
  for (const [mfr, items] of byManufacturer) {
    const byName = new Map()
    for (const item of items) {
      if (!byName.has(item.name)) byName.set(item.name, [])
      byName.get(item.name).push(locationLabel(item))
    }
    const distinctNames = [...byName.keys()]
    if (distinctNames.length < 2) continue

    const exactPairs = []
    const modelPairs = []
    for (let i = 0; i < distinctNames.length; i++) {
      for (let j = i + 1; j < distinctNames.length; j++) {
        const a = distinctNames[i]
        const b = distinctNames[j]
        if (normalize(a) === normalize(b)) {
          exactPairs.push({ a, b })
          continue
        }
        const modelA = extractModelNumber(a, mfr)
        const modelB = extractModelNumber(b, mfr)
        if (modelA && modelB && modelA === modelB) {
          modelPairs.push({ a, b, model: modelA })
        }
      }
    }
    if (exactPairs.length > 0) tier1.push({ manufacturer: mfr, byName, pairs: exactPairs })
    if (modelPairs.length > 0) tier2.push({ manufacturer: mfr, byName, pairs: modelPairs })
  }
  return { tier1, tier2 }
}

function printGroups(title, groups, formatPair) {
  if (groups.length === 0) {
    console.log(`\n${title}: none.`)
    return
  }
  console.log(`\n${'-'.repeat(60)}\n${title} — ${groups.length} manufacturer group(s)\n${'-'.repeat(60)}`)
  for (const group of groups) {
    console.log(`\n  Manufacturer: ${group.manufacturer}`)
    const namesInvolved = new Set()
    for (const pair of group.pairs) {
      namesInvolved.add(pair.a)
      namesInvolved.add(pair.b)
    }
    for (const name of namesInvolved) {
      const locs = group.byName.get(name)
      console.log(`    "${name}"  (${locs.length}x) — ${locs.join(', ')}`)
    }
    for (const pair of group.pairs) {
      console.log(`      ~ "${pair.a}"  <->  "${pair.b}"${formatPair(pair)}`)
    }
  }
}

function report(kind, rows) {
  const { tier1, tier2 } = analyze(rows)
  console.log(`\n${'='.repeat(60)}\n${kind}\n${'='.repeat(60)}`)
  printGroups(
    'TIER 1 — same after ignoring punctuation/case/spacing (high confidence, same item)',
    tier1,
    () => ''
  )
  printGroups(
    'TIER 2 — same manufacturer + same model number, but not identical (needs a human — could be the same model formatted differently, or a genuinely different variant)',
    tier2,
    (pair) => `   [model "${pair.model}"]`
  )
}

report('MICS', mics)
report('OUTBOARD', outboard)

const micsMissingManufacturer = mics.filter((m) => !m.manufacturer || !m.manufacturer.trim()).length
const outboardMissingManufacturer = outboard.filter((o) => !o.manufacturer || !o.manufacturer.trim()).length
console.log(`\n${'='.repeat(60)}`)
console.log(`Rows with no manufacturer set: ${micsMissingManufacturer} mics, ${outboardMissingManufacturer} outboard.`)
console.log('(These are grouped under "(no manufacturer)" above and may hide cross-manufacturer duplicates.)')

db.close()
