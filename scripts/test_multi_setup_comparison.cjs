// Verifies the Multi Setup Compare data layer against a real, fully-migrated in-memory database,
// running the REAL repository code (bundled from TS via esbuild with getDb stubbed).
//
// Covers the two things the "changeover vs. paperwork" rework changed underneath the UI:
//   1. getMultiSetupComparison ships the full patch (mic, preamp, tie line, cue box, 48V, polarity,
//      outboards) — the same field set alignMultiSetupRow writes, so the grid can't call a row
//      matched while Match would rewrite it.
//   2. renameComparisonItem touches exactly one row's source_name and nothing else.
//
// Run with: node scripts/test_multi_setup_comparison.cjs
// Requires better-sqlite3 built for Node ABI (npm rebuild better-sqlite3 --build-from-source=false),
// then rebuild for Electron afterwards (npx electron-rebuild -f -w better-sqlite3).
const Database = require('better-sqlite3')
const esbuild = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const assert = require('node:assert')

const ROOT = path.join(__dirname, '..')

// `import initSql from './001_init.sql?raw'` is a Vite convention esbuild doesn't know.
const rawSqlPlugin = {
  name: 'raw-sql',
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: path.resolve(path.dirname(args.importer), args.path.replace(/\?raw$/, '')),
      namespace: 'raw'
    }))
    build.onLoad({ filter: /.*/, namespace: 'raw' }, (args) => ({
      contents: `export default ${JSON.stringify(fs.readFileSync(args.path, 'utf8'))}`,
      loader: 'js'
    }))
  }
}

// The repositories reach the database through getDb() in src/main/db/index.ts, which pulls in
// electron for the userData path. Swap it for the test database instead of booting Electron.
const stubGetDbPlugin = {
  name: 'stub-get-db',
  setup(build) {
    build.onResolve({ filter: /^\.\.\/index$/ }, (args) =>
      args.importer.includes(`${path.sep}repositories${path.sep}`) ? { path: 'stub-db', namespace: 'stub' } : null
    )
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'exports.getDb = () => globalThis.__testDb',
      loader: 'js'
    }))
  }
}

// Some migrations seed room-layout PDFs and reach for Electron's app paths. Point userData at a
// scratch directory and the bundled layouts at the repo's own resources/ so they run for real.
const TEST_USER_DATA = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ssh-multi-setup-test-'))
const stubElectronPlugin = {
  name: 'stub-electron',
  setup(build) {
    build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub-electron' }))
    build.onLoad({ filter: /.*/, namespace: 'stub-electron' }, () => ({
      contents: `exports.app = {
        isPackaged: false,
        getAppPath: () => ${JSON.stringify(ROOT)},
        getPath: () => ${JSON.stringify(TEST_USER_DATA)}
      }`,
      loader: 'js'
    }))
  }
}

const bundle = esbuild.build({
  stdin: {
    contents: `
      export { runMigrations } from './src/main/db/migrate'
      export * as multiSetups from './src/main/db/repositories/multiSetupsRepo'
    `,
    resolveDir: ROOT,
    loader: 'ts'
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['better-sqlite3'],
  tsconfig: path.join(ROOT, 'tsconfig.node.json'),
  plugins: [rawSqlPlugin, stubGetDbPlugin, stubElectronPlugin]
})

function loadBundle(code) {
  const mod = new Module('multi-setup-test-bundle')
  mod.paths = Module._nodeModulePaths(ROOT)
  mod._compile(code, path.join(ROOT, 'multi-setup-test-bundle.js'))
  return mod.exports
}

function seed(db) {
  // Minimum viable session: one building, one studio, two setups grouped into a Multi Setup.
  const buildingId = db.prepare("INSERT INTO buildings (name) VALUES ('Test Building')").run().lastInsertRowid
  const studioId = db
    .prepare('INSERT INTO studios (building_id, name) VALUES (?, ?)')
    .run(buildingId, 'Test Studio').lastInsertRowid

  const multiSetupId = db
    .prepare('INSERT INTO multi_setups (studio_id, name) VALUES (?, ?)')
    .run(studioId, 'Saturday Session').lastInsertRowid

  const makeSetup = (name, sortOrder) =>
    db
      .prepare('INSERT INTO setups (studio_id, name, sort_order, multi_setup_id) VALUES (?, ?, ?, ?)')
      .run(studioId, name, sortOrder, multiSetupId).lastInsertRowid

  const jazz = makeSetup('Jazz Quartet', 0)
  const bluegrass = makeSetup('Bluegrass Trio', 1)

  const micId = db
    .prepare("INSERT INTO mics (pool_type, studio_id, name) VALUES ('studio', ?, 'KM184')")
    .run(studioId).lastInsertRowid
  const otherMicId = db
    .prepare("INSERT INTO mics (pool_type, studio_id, name) VALUES ('studio', ?, 'MD421')")
    .run(studioId).lastInsertRowid
  const preampId = db
    .prepare("INSERT INTO preamps (pool_type, studio_id, name) VALUES ('studio', ?, 'API 512c')")
    .run(studioId).lastInsertRowid
  const outboardId = db
    .prepare("INSERT INTO outboard_gear (pool_type, studio_id, name) VALUES ('studio', ?, 'LA-2A')")
    .run(studioId).lastInsertRowid

  const addItem = db.prepare(
    `INSERT INTO setup_items
       (setup_id, instrument_type, source_name, channel, tie_line, cue_box,
        mic_id, mic_text, preamp_id, phantom_power, polarity_flip, sort_order)
     VALUES (@setupId, 'custom_source', @sourceName, @channel, @tieLine, @cueBox,
             @micId, @micText, @preampId, @phantom, @polarity, @sortOrder)`
  )
  const base = { tieLine: null, cueBox: null, micText: null, preampId: null, phantom: 0, polarity: 0 }

  // Ch 5: identical patch, different name — the jazz-sax/bluegrass-fiddle case. Must NOT read as
  // changeover work.
  const jazzSax = addItem.run({ ...base, setupId: jazz, sourceName: 'Tenor Sax', channel: 5, micId, sortOrder: 0 })
    .lastInsertRowid
  addItem.run({ ...base, setupId: bluegrass, sourceName: 'Fiddle', channel: 5, micId, sortOrder: 0 })

  // Ch 6: same name, mic swapped — real changeover work.
  addItem.run({ ...base, setupId: jazz, sourceName: 'Horn', channel: 6, micId, sortOrder: 1 })
  addItem.run({ ...base, setupId: bluegrass, sourceName: 'Horn', channel: 6, micId: otherMicId, sortOrder: 1 })

  // Ch 7: same name AND same mic, but the tie line moved — the class of drift the OLD payload
  // couldn't even see, while Match happily overwrote it.
  addItem.run({ ...base, setupId: jazz, sourceName: 'Bass', channel: 7, micId, tieLine: 12, sortOrder: 2 })
  addItem.run({ ...base, setupId: bluegrass, sourceName: 'Bass', channel: 7, micId, tieLine: 34, sortOrder: 2 })

  // Ch 8: preamp, 48V, polarity and an outboard slot, all matching — exercises every remaining
  // patch field on the happy path.
  const jazzVox = addItem.run({
    ...base,
    setupId: jazz,
    sourceName: 'Vocal',
    channel: 8,
    micId,
    preampId,
    phantom: 1,
    polarity: 1,
    sortOrder: 3
  }).lastInsertRowid
  const bluegrassVox = addItem.run({
    ...base,
    setupId: bluegrass,
    sourceName: 'Vocal',
    channel: 8,
    micId,
    preampId,
    phantom: 1,
    polarity: 1,
    sortOrder: 3
  }).lastInsertRowid
  const addSlot = db.prepare(
    'INSERT INTO setup_item_outboards (setup_item_id, slot_index, outboard_id) VALUES (?, 0, ?)'
  )
  addSlot.run(jazzVox, outboardId)
  addSlot.run(bluegrassVox, outboardId)

  // Unpatched rows — no channel. Compare pairs these across bands by their position in the sheet,
  // which is only sound because the payload preserves sort_order. Seeded out of insertion order on
  // the bluegrass side so a missing ORDER BY would show up as a scrambled pairing.
  addItem.run({ ...base, setupId: jazz, sourceName: 'Trumpet', channel: null, micId, sortOrder: 4 })
  addItem.run({ ...base, setupId: jazz, sourceName: 'Guitar', channel: null, micId, sortOrder: 5 })
  addItem.run({ ...base, setupId: bluegrass, sourceName: 'Banjo', channel: null, micId, sortOrder: 5 })
  addItem.run({ ...base, setupId: bluegrass, sourceName: 'Fiddle', channel: null, micId, sortOrder: 4 })

  return { multiSetupId, jazz, bluegrass, jazzSaxItemId: jazzSax, micId, otherMicId }
}

/** The renderer's predicate, mirrored here so this script fails if the payload stops carrying what
 *  the grid compares. Keep in step with PATCH_FIELDS in MultiSetupComparePage.tsx. */
function patchSignature(item) {
  return [
    item.micLabel ?? '',
    item.preampLabel ?? '',
    item.tieLine != null ? String(item.tieLine) : '',
    item.cueBox != null ? String(item.cueBox) : '',
    item.phantomPower ? 'on' : '',
    item.polarityFlip ? 'flipped' : '',
    item.outboardLabels.join(', ')
  ].join('\u001F')
}

function itemAtChannel(member, channel) {
  const found = member.items.filter((i) => i.channel === channel)
  assert.strictEqual(found.length, 1, `expected exactly one item on ch ${channel} in ${member.name}`)
  return found[0]
}

async function main() {
  const built = await bundle
  const { runMigrations, multiSetups } = loadBundle(built.outputFiles[0].text)

  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  globalThis.__testDb = db

  const ids = seed(db)
  const comparison = multiSetups.getMultiSetupComparison(ids.multiSetupId)
  assert.ok(comparison, 'comparison should not be null')

  // --- Column order is the tab strip's order (sort_order, id) -------------------------------
  assert.deepStrictEqual(
    comparison.members.map((m) => m.name),
    ['Jazz Quartet', 'Bluegrass Trio'],
    'members should come back in sort_order'
  )
  const [jazz, bluegrass] = comparison.members

  // --- 1. The payload carries the full patch ------------------------------------------------
  const jazzVocal = itemAtChannel(jazz, 8)
  assert.strictEqual(jazzVocal.micLabel, 'KM184', 'mic resolves to the catalog name')
  assert.strictEqual(jazzVocal.preampLabel, 'API 512c', 'preamp resolves to the catalog name')
  assert.strictEqual(jazzVocal.phantomPower, true, '48V comes back as a boolean')
  assert.strictEqual(jazzVocal.polarityFlip, true, 'polarity comes back as a boolean')
  assert.deepStrictEqual(jazzVocal.outboardLabels, ['LA-2A'], 'outboard slots resolve to names')
  assert.strictEqual(itemAtChannel(jazz, 7).tieLine, 12, 'tie line is carried')
  assert.strictEqual(itemAtChannel(jazz, 5).cueBox, null, 'an unset cue box is null, not 0')
  console.log('ok  payload carries mic, preamp, tie line, cue box, 48V, polarity and outboards')

  // --- 2. A pure rename is NOT changeover work ----------------------------------------------
  assert.strictEqual(
    patchSignature(itemAtChannel(jazz, 5)),
    patchSignature(itemAtChannel(bluegrass, 5)),
    'Ch 5 patch must match across bands despite "Tenor Sax" vs "Fiddle"'
  )
  assert.notStrictEqual(
    itemAtChannel(jazz, 5).sourceName,
    itemAtChannel(bluegrass, 5).sourceName,
    'Ch 5 names should genuinely differ, or this test proves nothing'
  )
  console.log('ok  a renamed channel with an identical patch produces one signature')

  // --- 3. Real drift still differs ----------------------------------------------------------
  assert.notStrictEqual(
    patchSignature(itemAtChannel(jazz, 6)),
    patchSignature(itemAtChannel(bluegrass, 6)),
    'a swapped mic must differ'
  )
  assert.notStrictEqual(
    patchSignature(itemAtChannel(jazz, 7)),
    patchSignature(itemAtChannel(bluegrass, 7)),
    'a moved tie line must differ — this is what the old mic-only payload missed'
  )
  assert.strictEqual(
    patchSignature(itemAtChannel(jazz, 8)),
    patchSignature(itemAtChannel(bluegrass, 8)),
    'a fully identical patch must match'
  )
  console.log('ok  a swapped mic and a moved tie line both register as changeover')

  // --- 3b. Unpatched rows come back, in sheet order ------------------------------------------
  // Compare pairs channel-less rows across bands by position, so this ordering IS the pairing.
  assert.deepStrictEqual(
    jazz.items.filter((i) => i.channel == null).map((i) => i.sourceName),
    ['Trumpet', 'Guitar'],
    'rows with no channel must be present and in sort_order'
  )
  assert.deepStrictEqual(
    bluegrass.items.filter((i) => i.channel == null).map((i) => i.sourceName),
    ['Fiddle', 'Banjo'],
    'sort_order, not insertion order, decides the pairing'
  )
  console.log('ok  channel-less rows are returned in sheet order, so position pairing is sound')

  // --- 4. renameComparisonItem writes exactly one row ---------------------------------------
  const before = db.prepare('SELECT id, source_name FROM setup_items ORDER BY id').all()
  multiSetups.renameComparisonItem(ids.jazzSaxItemId, 'Soprano Sax')
  const after = db.prepare('SELECT id, source_name FROM setup_items ORDER BY id').all()

  const changed = after.filter((row, i) => row.source_name !== before[i].source_name)
  assert.strictEqual(changed.length, 1, 'exactly one row should change')
  assert.strictEqual(changed[0].id, Number(ids.jazzSaxItemId), 'the targeted row should be the one that changed')
  assert.strictEqual(changed[0].source_name, 'Soprano Sax')

  // The patch must survive a rename untouched — renaming is paperwork, not patch work.
  const afterRename = multiSetups.getMultiSetupComparison(ids.multiSetupId)
  assert.strictEqual(
    patchSignature(itemAtChannel(afterRename.members[0], 5)),
    patchSignature(itemAtChannel(afterRename.members[1], 5)),
    'renaming must not disturb the patch signature'
  )
  console.log('ok  renameComparisonItem changes one source_name and leaves the patch alone')

  // A no-op id must not throw or touch anything.
  multiSetups.renameComparisonItem(999999, 'Nobody')
  assert.strictEqual(
    db.prepare('SELECT COUNT(*) c FROM setup_items').get().c,
    after.length,
    'renaming a missing row should be a no-op'
  )
  console.log('ok  renaming a missing row is a harmless no-op')

  // --- 5. setComparisonItemMic ---------------------------------------------------------------
  // The payload has to carry the mic id, or Compare's picker has nothing to show as selected.
  const withMicId = multiSetups.getMultiSetupComparison(ids.multiSetupId)
  assert.strictEqual(
    itemAtChannel(withMicId.members[0], 5).micId,
    Number(ids.micId),
    'the payload should carry micId alongside the resolved micLabel'
  )
  assert.strictEqual(
    withMicId.members[0].facultyReserveEnabled,
    false,
    'each member should carry its own faculty-reserve flag'
  )
  assert.strictEqual(withMicId.studioIsTemporary, false, 'a normal studio is not temporary')

  const micRow = () => db.prepare('SELECT mic_id, mic_text, notes FROM setup_items WHERE id = ?').get(ids.jazzSaxItemId)

  // Start from a free-text mic so the catalog pick has something to clear.
  multiSetups.setComparisonItemMic(ids.jazzSaxItemId, null, 'Borrowed 414', null)
  assert.deepStrictEqual(
    { mic_id: micRow().mic_id, mic_text: micRow().mic_text },
    { mic_id: null, mic_text: 'Borrowed 414' },
    'free text should clear mic_id'
  )

  // Picking from the catalog must clear the free text, or it lingers invisibly behind the id and
  // resurfaces as an "Unresolved" badge the moment the mic is cleared.
  multiSetups.setComparisonItemMic(ids.jazzSaxItemId, Number(ids.otherMicId), null, '[Faculty Reserve]')
  assert.deepStrictEqual(
    micRow(),
    { mic_id: Number(ids.otherMicId), mic_text: null, notes: '[Faculty Reserve]' },
    'a catalog pick should set mic_id, clear mic_text, and carry the pool tag through'
  )

  multiSetups.setComparisonItemMic(ids.jazzSaxItemId, null, null, null)
  assert.deepStrictEqual(micRow(), { mic_id: null, mic_text: null, notes: null }, '"No Mic" should clear both')

  // Exactly one row, and no throw on a missing id.
  const micsBefore = db.prepare('SELECT id, mic_id, mic_text FROM setup_items ORDER BY id').all()
  multiSetups.setComparisonItemMic(ids.jazzSaxItemId, Number(ids.micId), null, null)
  const micsAfter = db.prepare('SELECT id, mic_id, mic_text FROM setup_items ORDER BY id').all()
  const micChanged = micsAfter.filter((row, i) => row.mic_id !== micsBefore[i].mic_id)
  assert.strictEqual(micChanged.length, 1, 'exactly one row should change')
  assert.strictEqual(micChanged[0].id, Number(ids.jazzSaxItemId))
  multiSetups.setComparisonItemMic(999999, 1, null, null)
  console.log('ok  setComparisonItemMic sets, clears and swaps one row\'s mic without touching others')

  // --- 6. Stereo-pair linking ----------------------------------------------------------------
  // The trap this guards: sibling setups are made by copying, and copyItemsToSetup carries group_id
  // across verbatim, so the same uuid is live in BOTH bands. Unlinking one band must leave the
  // other alone, which only works because the queries are scoped by (setup_id, group_id).
  const jazzOh = jazz.items.filter((i) => i.channel === 5 || i.channel === 6).map((i) => i.itemId)
  const bluegrassOh = bluegrass.items.filter((i) => i.channel === 5 || i.channel === 6).map((i) => i.itemId)
  assert.strictEqual(jazzOh.length, 2, 'expected two overhead rows to pair')

  multiSetups.linkComparisonItems(jazzOh, 'shared-uuid')
  multiSetups.linkComparisonItems(bluegrassOh, 'shared-uuid')
  const groupOf = (itemId) => db.prepare('SELECT group_id FROM setup_items WHERE id = ?').get(itemId).group_id
  assert.ok(
    jazzOh.every((id) => groupOf(id) === 'shared-uuid') && bluegrassOh.every((id) => groupOf(id) === 'shared-uuid'),
    'both bands should hold the group'
  )

  multiSetups.unlinkComparisonGroup(ids.bluegrass, 'shared-uuid')
  assert.ok(bluegrassOh.every((id) => groupOf(id) === null), 'the targeted band should be unlinked')
  assert.ok(
    jazzOh.every((id) => groupOf(id) === 'shared-uuid'),
    'the OTHER band must keep its pair even though it shares the uuid'
  )
  console.log('ok  unlinking one band leaves a sibling holding the same group uuid untouched')

  // A row belongs to one group at a time: re-linking must dissolve the group it came from rather
  // than stranding the old partner with a dead id.
  const jazzUnassigned = jazz.items.filter((i) => i.channel == null).map((i) => i.itemId)
  multiSetups.linkComparisonItems([jazzOh[1], jazzUnassigned[0]], 'second-uuid')
  assert.strictEqual(groupOf(jazzOh[0]), null, 'the abandoned partner should be released, not left dangling')
  assert.strictEqual(groupOf(jazzOh[1]), 'second-uuid')
  assert.strictEqual(groupOf(jazzUnassigned[0]), 'second-uuid')
  console.log('ok  re-linking a row dissolves the group it was already in')

  // A group of three (which duplicate-row can produce) must clear entirely, not just two of them.
  multiSetups.linkComparisonItems([jazzUnassigned[0], jazzUnassigned[1], jazzOh[1]], 'trio-uuid')
  multiSetups.unlinkComparisonGroup(ids.jazz, 'trio-uuid')
  assert.ok(
    [jazzOh[1], jazzUnassigned[0], jazzUnassigned[1]].every((id) => groupOf(id) === null),
    'every member of the group should be cleared, not just a pair'
  )
  console.log('ok  unlinking clears every member of a 3-row group')

  console.log('\nAll Multi Setup comparison checks passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
