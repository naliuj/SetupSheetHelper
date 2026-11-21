// Checks the band rules (src/shared/utils/bands.ts): band ranges, "Add band" copies, what counts
// as changeover work, and which later rows an edit can be carried into.
// Run with `node scripts/check_bands.mjs`; exits non-zero on any failure.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildSync } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'bands-'))
const out = join(dir, 'bands.mjs')
buildSync({ entryPoints: [join(root, 'src/shared/utils/bands.ts')], bundle: true, format: 'esm', outfile: out, logLevel: 'error' })
const B = await import(pathToFileURL(out).href)
rmSync(dir, { recursive: true, force: true })

let failures = 0
function check(name, got, expected) {
  const g = JSON.stringify(got)
  const e = JSON.stringify(expected)
  const ok = g === e
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${e}\n      got      ${g}`}`)
}

let nextId = 0
const row = (sourceName, over = {}) => ({
  id: `r${++nextId}`, instrumentType: 'custom_source', sourceName, micId: null, micText: null,
  phantomPower: false, channel: null, tieLine: null, cueBox: null, outboards: [], preampId: null,
  preampText: null, polarityFlip: false, groupId: null, copyKey: null, inactive: false, ...over
})
const divider = (name) => row(name, { instrumentType: B.BAND_DIVIDER })
let key = 0
const newKey = () => `k${++key}`
const next = (items) =>
  B.appendBand(items, B.bandRanges(items).length - 1, divider, (item, groupId, copyKey) => ({ ...item, id: `${item.id}'`, groupId, copyKey }), newKey).items
const names = { mic: (r) => r.micText, preamp: (r) => r.preampText, outboards: () => null }
const show = (items) => items.map((r) => (B.isBandDivider(r) ? `[${r.sourceName}]` : r.sourceName)).join(' ')

// Ranges
check('no dividers is one band', B.bandRanges([row('A'), row('B')]).map((r) => [r.start, r.end]), [[0, 2]])
check('empty sheet is one band', B.bandRanges([]).length, 1)
const two = [divider('Band 1'), row('A'), divider('Band 2'), row('B'), row('C')]
check('two bands', B.bandRanges(two).map((r) => [r.index, r.start, r.end]), [[0, 1, 2], [1, 3, 5]])
check('band indexes include dividers', B.bandIndexes(two), [0, 0, 1, 1, 1])

// Add band (copy of the last band)
const kick = row('Kick', { channel: 1, micText: 'D112' })
const ohL = row('OH L', { channel: 2, micText: 'KM184', groupId: 'g1' })
const ohR = row('OH R', { channel: 3, micText: 'KM184', groupId: 'g1' })
const sheet = next([kick, ohL, ohR])
check('first Add band adds Band 1 on top and Band 2 below', show(sheet), '[Band 1] Kick OH L OH R [Band 2] Kick OH L OH R')
check('copies share copyKeys with their source', sheet[1].copyKey === sheet[5].copyKey && sheet[1].copyKey != null, true)
check('copied pair gets one fresh groupId', [sheet[6].groupId === sheet[7].groupId, sheet[6].groupId !== 'g1'], [true, true])
check('source pair keeps its groupId', sheet[2].groupId, 'g1')
const three = next(sheet)
check('second Add band copies the last band', show(three), '[Band 1] Kick OH L OH R [Band 2] Kick OH L OH R [Band 3] Kick OH L OH R')
check('a band 3 copy shares the band 1 key', three[9].copyKey === three[1].copyKey, true)

// Changes
const band1 = sheet.slice(1, 4)
const band2 = sheet.slice(5, 8).map((r) => ({ ...r }))
band2[0].sourceName = 'Kick In' // renamed only
band2[1].micText = 'SM81' // changed
const added = row('Banjo', { channel: 4, micText: 'SM81', tieLine: '4' })
const removedBand2 = [band2[0], band2[1], added] // OH R removed
const c = B.bandChanges(band1, removedBand2)
check('statuses', c.rows.map((r) => r.status), ['renamed', 'changed', 'new'])
check('changed fields', c.rows[1].fields, ['mic'])
check('renamed flags', c.rows.map((r) => r.renamed), [true, false, false])
check('a rename leads the change text', B.describeRowChange({ ...c.rows[1], renamed: true, item: { ...c.rows[1].item, sourceName: 'Overhead L' } }, names), 'Overhead L (ch 2): name OH L → Overhead L; mic KM184 → SM81')
check('removed rows', c.removed.map((r) => r.sourceName), ['OH R'])
check('rename alone is not a move', B.changeCount(c), 3)
check('describe', B.describeBandChanges(c, names), {
  changed: ['OH L (ch 2): mic KM184 → SM81'],
  added: ['Add Banjo (ch 4): SM81, TL 4'],
  removed: ['Remove OH R (ch 3)']
})
check('empty text equals null', B.patchValue(row('x', { tieLine: ' ' }), 'tieLine') === B.patchValue(row('y'), 'tieLine'), true)
check('48V toggle reads as on', B.describeRowChange({ item: { ...kick, phantomPower: true }, previous: kick, fields: ['phantomPower'], status: 'changed' }, names), 'Kick (ch 1): 48V on')
check('allBandChanges skips band 1', [...B.allBandChanges(three).keys()], [1, 2])

// Rows off in a band: never a change, and the match before stays kept
{
  // three = [Band 1] Kick OH L OH R [Band 2] Kick OH L OH R [Band 3] Kick OH L OH R
  const offSheet = three.map((r, i) => (i === 6 ? { ...r, inactive: true, micText: 'C414' } : r))
  const all = B.allBandChanges(offSheet)
  const band2 = all.get(1)
  check('a row off in band 2 is "off"', band2.rows.map((r) => r.status), ['same', 'off', 'same'])
  check('its band 1 match is not removed', band2.removed.length, 0)
  check('an off row is not counted', B.changeCount(band2), 0)
  check('an off row is not in the changeover list', B.describeBandChanges(band2, names), { changed: [], added: [], removed: [] })
  check('on again in band 3, compared with band 2: the mic differs', all.get(2).rows[1].status, 'changed')
  const sameMic = three.map((r, i) => (i === 6 ? { ...r, inactive: true } : r))
  check('on again in band 3 with the same patch is "same"', B.allBandChanges(sameMic).get(2).rows[1].status, 'same')
  const fresh = [...three, { ...row('Shaker', { inactive: true }) }]
  check('a fresh row that is off is "off", not "new"', B.allBandChanges(fresh).get(2).rows[3].status, 'off')
  check('isOff needs a sheet with bands', [B.isOff({ inactive: true }, true), B.isOff({ inactive: true }, false), B.isOff({ inactive: false }, true)], [true, false, false])
}

// Carry an edit forward
const before = three[1]
const edited = three.map((r, i) => (i === 1 ? { ...r, micText: 'Beta 91' } : r))
check('later matches with the old value', B.laterMatches(edited, edited[1], before, 'mic').map((r) => r.id), [three[5].id, three[9].id])
const diverged = edited.map((r, i) => (i === 9 ? { ...r, micText: 'D6' } : r))
check('a band that changed it on its own is left alone', B.laterMatches(diverged, diverged[1], before, 'mic').map((r) => r.id), [three[5].id])
check('earlier bands are never offered', B.laterMatches(edited, edited[9], three[9], 'mic').length, 0)
check('rows without a copyKey have no matches', B.laterMatches([row('A')], row('A'), row('A'), 'mic').length, 0)

// Per-row lookups for the table and exports
const removedSheet = [sheet[0], ...band1, sheet[4], ...removedBand2]
const rc = B.rowChanges(removedSheet)
check('rowChanges skips band 1', removedSheet.slice(1, 4).some((r) => rc.has(r.id)), false)
check('rowChanges covers later bands', [...rc.values()].map((r) => r.status), ['renamed', 'changed', 'new'])
check('field to column', [B.FIELD_COLUMN.polarityFlip, B.FIELD_COLUMN.outboards], ['polarity', 'outboard'])
const slots = (list) => row('x', { outboards: list.map(([slotIndex, outboardText]) => ({ slotIndex, outboardId: null, outboardText })) })
check('changed outboard slots', B.changedOutboardSlots(slots([[0, '1176'], [2, 'LA-2A']]), slots([[0, '1176'], [1, 'Pultec']])), [1, 2])
check('same outboards, no slots', B.changedOutboardSlots(slots([[0, '1176']]), slots([[0, ' 1176 ']])), [])

// Add band from any band, a blank band, and reordering
const add = (items, source) =>
  B.appendBand(items, source, divider, (item, groupId, copyKey) => ({ ...item, id: `${item.id}+`, groupId, copyKey }), newKey).items
const fromFirst = add([divider('Jazz'), row('Bass', { copyKey: 'b' }), divider('Folk'), row('Fiddle')], 0)
check('copy an earlier band', show(fromFirst), '[Jazz] Bass [Folk] Fiddle [Band 3] Bass')
check('earlier copy shares its copyKey', fromFirst[5].copyKey, 'b')
check('blank band', show(add([row('A')], null)), '[Band 1] A [Band 2]')
const order = [divider('One'), row('a'), divider('Two'), row('b'), row('c'), divider('Three')]
check('move a band down', show(B.moveBand(order, 0, 2)), '[Two] b c [Three] [One] a')
check('move a band up', show(B.moveBand(order, 2, 0)), '[Three] [One] a [Two] b c')
check('move onto itself is a no-op', B.moveBand(order, 1, 1), order)
check('sheet without dividers is left alone', B.moveBand([row('a')], 0, 0).length, 1)

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
