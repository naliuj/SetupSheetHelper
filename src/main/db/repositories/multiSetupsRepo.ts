import type {
  MultiSetup,
  MultiSetupComparison,
  MultiSetupComparisonItem,
  MultiSetupMember,
  Setup
} from '@shared/types/setup'
import { normalizeSourceName } from '@shared/utils/normalizeSourceName'
import { getDb } from '../index'
import { copySetupContentTo, createSetup, removeSetups } from './setupsRepo'

interface MultiSetupRow {
  id: number
  studio_id: number
  name: string
  created_at: string
  last_setup_id: number | null
}

function mapRow(row: MultiSetupRow): MultiSetup {
  return {
    id: row.id,
    studioId: row.studio_id,
    name: row.name,
    createdAt: row.created_at,
    lastSetupId: row.last_setup_id
  }
}

/** Remembers which member the user is currently in, so Home's grouped card reopens there. Fired
 *  from SetupEditor's load effect — the one funnel every "a setup is now open" transition passes
 *  through — and no-ops for a standalone setup, since the subselect finds no group. */
export function recordLastOpenedSetup(setupId: number): void {
  getDb()
    .prepare('UPDATE multi_setups SET last_setup_id = ? WHERE id = (SELECT multi_setup_id FROM setups WHERE id = ?)')
    .run(setupId, setupId)
}

/** Every Multi Setup in the app — the table is small (one row per grouped session), so Home badges
 *  its whole Saved Setups list off one flat fetch instead of N per-card lookups. */
export function listAllMultiSetups(): MultiSetup[] {
  const rows = getDb().prepare('SELECT * FROM multi_setups ORDER BY name').all() as MultiSetupRow[]
  return rows.map(mapRow)
}

export function getMultiSetup(id: number): MultiSetup | null {
  const row = getDb().prepare('SELECT * FROM multi_setups WHERE id = ?').get(id) as MultiSetupRow | undefined
  return row ? mapRow(row) : null
}

/** Which Multi Setup (if any) one setup belongs to — the editor tab strip's own lookup when it
 *  only has a single setupId (Home uses listAllMultiSetups + Setup.multiSetupId in bulk instead). */
export function getMultiSetupForSetup(setupId: number): MultiSetup | null {
  const row = getDb()
    .prepare('SELECT ms.* FROM multi_setups ms JOIN setups s ON s.multi_setup_id = ms.id WHERE s.id = ?')
    .get(setupId) as MultiSetupRow | undefined
  return row ? mapRow(row) : null
}

/** Ordered members of a Multi Setup — the tab strip's data source, and the trivial "list every
 *  setup in this group" query any future overlap/comparison tool will also need. */
export function listMultiSetupMembers(multiSetupId: number): MultiSetupMember[] {
  return getDb()
    .prepare('SELECT id, name FROM setups WHERE multi_setup_id = ? ORDER BY sort_order, id')
    .all(multiSetupId) as MultiSetupMember[]
}

interface SessionContext {
  studio_id: number
  session_date: string | null
  engineer: string | null
  faculty_reserve_enabled: number
  folder_id: number | null
  session_notes: string | null
}

/** The header fields a sibling setup inherits from the one it's being added alongside. Bands in one
 *  Multi Setup play the same session in the same room, so date/engineer/faculty-reserve/notes carry
 *  over, and folder does too (Home derives a group's folder from its members, so they have to
 *  agree). `artist` deliberately does NOT — that's the one thing that differs per band. */
function readSessionContext(db: ReturnType<typeof getDb>, setupId: number): SessionContext {
  const row = db
    .prepare(
      `SELECT studio_id, session_date, engineer, faculty_reserve_enabled, folder_id, session_notes
         FROM setups WHERE id = ?`
    )
    .get(setupId) as SessionContext | undefined
  if (!row) throw new Error('Setup not found')
  return row
}

/** Creates a sibling setup as a full copy of `sourceSetupId` — same sheet, same layout, same column
 *  config — under a new name and with the artist cleared.
 *
 *  Bands in one session overlap heavily (the drum kit, the room mics, the tie line plan), so
 *  starting a new band from the previous one's sheet is far closer to the truth than starting
 *  blank: the engineer deletes what this band doesn't need instead of retyping what it shares.
 *  That's also the whole point of the Compare view — the less that drifts between bands, the less
 *  there is to re-patch at changeover. */
function createSiblingSetupFrom(db: ReturnType<typeof getDb>, sourceSetupId: number, name: string): Setup {
  const context = readSessionContext(db, sourceSetupId)
  const setup = createSetup(
    context.studio_id,
    name,
    context.session_date,
    'setup',
    null,
    context.folder_id,
    context.engineer,
    null,
    context.faculty_reserve_enabled === 1,
    context.session_notes
  )
  copySetupContentTo(sourceSetupId, setup.id)
  return setup
}

export interface CreateMultiSetupWithSetupsInput {
  sourceSetupId: number
  name: string
  /** Row 1's (possibly edited) name — renames the source setup in place. */
  sourceSetupName: string
  /** One new setup per entry, each a copy of the one before it. Must be non-empty: a Multi Setup
   *  of one setup is just a setup, and the dissolve rule in setupsRepo.removeSetups would collapse
   *  it right back. */
  newSetupNames: string[]
}

/** The only creation path: promotes an existing setup into a new Multi Setup AND creates its
 *  siblings in one transaction, so the group is never persisted in the degenerate one-member
 *  state that the dissolve rule treats as meaningless. */
export function createMultiSetupWithSetups(input: CreateMultiSetupWithSetupsInput): MultiSetup {
  const names = input.newSetupNames.map((n) => n.trim()).filter(Boolean)
  if (names.length === 0) throw new Error('A Multi Setup needs at least one more setup')

  const db = getDb()
  const create = db.transaction(() => {
    const context = readSessionContext(db, input.sourceSetupId)
    const info = db
      .prepare('INSERT INTO multi_setups (studio_id, name) VALUES (?, ?)')
      .run(context.studio_id, input.name)
    const multiSetupId = Number(info.lastInsertRowid)
    // Name-only update rather than renameSetup(), which rewrites every field and would clobber
    // the source's artist/notes with whatever defaults the caller didn't send.
    db.prepare('UPDATE setups SET name = ?, multi_setup_id = ? WHERE id = ?').run(
      input.sourceSetupName,
      multiSetupId,
      input.sourceSetupId
    )
    // Chained: each new setup copies the one before it, starting from the setup being promoted.
    // With all of them created at once that's the same content either way, but it keeps "a new
    // setup inherits from the previous" true as the single rule for both creation paths.
    let previousSetupId = input.sourceSetupId
    for (const name of names) {
      const sibling = createSiblingSetupFrom(db, previousSetupId, name)
      db.prepare('UPDATE setups SET multi_setup_id = ? WHERE id = ?').run(multiSetupId, sibling.id)
      previousSetupId = sibling.id
    }
    return multiSetupId
  })
  return getMultiSetup(create()) as MultiSetup
}

/** Adds an EXISTING standalone setup to a Multi Setup — must already share the group's studio (one
 *  Multi Setup = one studio) and not already belong to another group. */
export function addSetupToMultiSetup(multiSetupId: number, setupId: number): void {
  const db = getDb()
  const group = db.prepare('SELECT studio_id FROM multi_setups WHERE id = ?').get(multiSetupId) as
    | { studio_id: number }
    | undefined
  if (!group) throw new Error('Multi Setup not found')
  const setup = db.prepare('SELECT studio_id, multi_setup_id FROM setups WHERE id = ?').get(setupId) as
    | { studio_id: number; multi_setup_id: number | null }
    | undefined
  if (!setup) throw new Error('Setup not found')
  if (setup.studio_id !== group.studio_id) throw new Error('Setup belongs to a different studio')
  if (setup.multi_setup_id != null) throw new Error('Setup already belongs to a Multi Setup')
  db.prepare('UPDATE setups SET multi_setup_id = ? WHERE id = ?').run(multiSetupId, setupId)
}

/** Adds a setup to an existing Multi Setup — the tab strip's "New setup" action. Copies the LAST
 *  member (the previous band in tab order), not whichever tab happens to be open: the group reads
 *  left to right, so "the one before this new one" is the last one in it. */
export function createSetupInMultiSetup(multiSetupId: number, name: string): Setup {
  const db = getDb()
  const create = db.transaction(() => {
    const members = listMultiSetupMembers(multiSetupId)
    if (members.length === 0) throw new Error('Multi Setup not found')
    const setup = createSiblingSetupFrom(db, members[members.length - 1].id, name)
    db.prepare('UPDATE setups SET multi_setup_id = ? WHERE id = ?').run(multiSetupId, setup.id)
    return setup
  })
  return { ...create(), multiSetupId }
}

export function renameMultiSetup(id: number, name: string): void {
  getDb().prepare('UPDATE multi_setups SET name = ? WHERE id = ?').run(name, id)
}

/** Every member's sheet in one round trip — the Compare grid needs all of them at once, and N×
 *  getSetupWithItems would ship full SetupItems (notes, colors, group ids) it never renders.
 *  Two statements regardless of member count: the rows and their outboard slots.
 *
 *  The selected column set is the full patch, matching alignMultiSetupRow's write list exactly (see
 *  MultiSetupComparisonItem). Anything narrower and Compare would show rows as matched that Match
 *  then rewrites. */
export function getMultiSetupComparison(multiSetupId: number): MultiSetupComparison | null {
  const db = getDb()
  const multiSetup = getMultiSetup(multiSetupId)
  if (!multiSetup) return null

  const studioIsTemporary =
    ((db.prepare('SELECT is_temporary FROM studios WHERE id = ?').get(multiSetup.studioId) as
      | { is_temporary: number }
      | undefined)?.is_temporary ?? 0) === 1

  const members = listMultiSetupMembers(multiSetupId)
  if (members.length === 0) {
    return { multiSetup, members: [], studioIsTemporary }
  }

  const setupIds = members.map((m) => m.id)
  const placeholders = setupIds.map(() => '?').join(',')

  // Not folded into listMultiSetupMembers: that feeds the tab strip, which has no use for the flag.
  const facultyBySetup = new Map(
    (
      db
        .prepare(`SELECT id, faculty_reserve_enabled FROM setups WHERE id IN (${placeholders})`)
        .all(...setupIds) as { id: number; faculty_reserve_enabled: number }[]
    ).map((r) => [r.id, r.faculty_reserve_enabled === 1])
  )

  const rows = db
    .prepare(
      `SELECT si.setup_id, si.id, si.source_name, si.channel, si.tie_line, si.cue_box,
              si.phantom_power, si.polarity_flip, si.notes, si.group_id, si.sort_order,
              si.mic_id, si.mic_text, m.name AS mic_name,
              si.preamp_text, p.name AS preamp_name
         FROM setup_items si
         LEFT JOIN mics m ON m.id = si.mic_id
         LEFT JOIN preamps p ON p.id = si.preamp_id
        WHERE si.setup_id IN (${placeholders})
        ORDER BY si.setup_id, si.sort_order, si.id`
    )
    .all(...setupIds) as {
    setup_id: number
    id: number
    source_name: string
    channel: number | null
    tie_line: number | null
    cue_box: number | null
    phantom_power: number
    polarity_flip: number
    notes: string | null
    group_id: string | null
    sort_order: number
    mic_id: number | null
    mic_text: string | null
    mic_name: string | null
    preamp_text: string | null
    preamp_name: string | null
  }[]

  // Slots for every member's rows in one statement, keyed by item. Ordered by slot_index so the
  // resulting label lists compare positionally.
  const outboardRows = db
    .prepare(
      `SELECT so.setup_item_id, so.outboard_text, o.name AS outboard_name
         FROM setup_item_outboards so
         JOIN setup_items si ON si.id = so.setup_item_id
         LEFT JOIN outboard_gear o ON o.id = so.outboard_id
        WHERE si.setup_id IN (${placeholders})
        ORDER BY so.setup_item_id, so.slot_index`
    )
    .all(...setupIds) as { setup_item_id: number; outboard_text: string | null; outboard_name: string | null }[]

  const outboardsByItem = new Map<number, string[]>()
  for (const row of outboardRows) {
    const label = row.outboard_name ?? row.outboard_text
    // Empty slots carry no changeover meaning — a row with slot 0 blank and one with no slot at all
    // are the same patch, so they must produce the same list.
    if (!label) continue
    const list = outboardsByItem.get(row.setup_item_id) ?? []
    list.push(label)
    outboardsByItem.set(row.setup_item_id, list)
  }

  const itemsBySetup = new Map<number, MultiSetupComparisonItem[]>()
  for (const row of rows) {
    const items = itemsBySetup.get(row.setup_id) ?? []
    items.push({
      itemId: row.id,
      sourceName: row.source_name,
      channel: row.channel,
      micLabel: row.mic_name ?? row.mic_text,
      micId: row.mic_id,
      notes: row.notes,
      groupId: row.group_id,
      sortOrder: row.sort_order,
      preampLabel: row.preamp_name ?? row.preamp_text,
      tieLine: row.tie_line,
      cueBox: row.cue_box,
      phantomPower: row.phantom_power !== 0,
      polarityFlip: row.polarity_flip !== 0,
      outboardLabels: outboardsByItem.get(row.id) ?? []
    })
    itemsBySetup.set(row.setup_id, items)
  }

  return {
    multiSetup,
    members: members.map((m) => ({
      setupId: m.id,
      name: m.name,
      facultyReserveEnabled: facultyBySetup.get(m.id) ?? false,
      items: itemsBySetup.get(m.id) ?? []
    })),
    studioIsTemporary
  }
}

/** Renames one row's source, straight from the Compare grid.
 *
 *  Narrow on purpose. Ordinary item persistence is the wholesale replaceItemsForSetup, which needs
 *  a full loaded sheet — Compare has none of the member sheets open, and touching the name is the
 *  one edit it offers. Sits here beside alignMultiSetupRow, which does the same kind of scoped
 *  cross-sheet write. */
export function renameComparisonItem(itemId: number, sourceName: string): void {
  const db = getDb()
  const rename = db.transaction(() => {
    const info = db
      .prepare(`UPDATE setup_items SET source_name = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(sourceName, itemId)
    if (info.changes === 0) return
    db.prepare(`UPDATE setups SET updated_at = datetime('now') WHERE id = (SELECT setup_id FROM setup_items WHERE id = ?)`).run(
      itemId
    )
  })
  rename()
}

/** Sets one row's mic, straight from the Compare grid. Same narrow-write reasoning as
 *  renameComparisonItem above.
 *
 *  micId and micText are mutually exclusive by construction, not by accident: display precedence is
 *  id-first, so leaving a stale micText behind a catalog pick would hide it until the mic was later
 *  cleared and then resurface it as an "Unresolved" badge. Picking from the catalog passes
 *  (id, null); a Quick Setup studio's free-text field passes (null, text); "No Mic" passes
 *  (null, null).
 *
 *  `notes` arrives already tagged by the caller — the renderer owns applyMicPoolNotesTag and knows
 *  the chosen mic's pool, so a mic picked here ends up indistinguishable from one picked in the
 *  setup sheet. */
export function setComparisonItemMic(
  itemId: number,
  micId: number | null,
  micText: string | null,
  notes: string | null
): void {
  const db = getDb()
  const setMic = db.transaction(() => {
    const info = db
      .prepare(
        `UPDATE setup_items SET mic_id = ?, mic_text = ?, notes = ?, updated_at = datetime('now')
          WHERE id = ?`
      )
      .run(micId, micText, notes, itemId)
    if (info.changes === 0) return
    db.prepare(
      `UPDATE setups SET updated_at = datetime('now') WHERE id = (SELECT setup_id FROM setup_items WHERE id = ?)`
    ).run(itemId)
  })
  setMic()
}

/** Bumps the owning setups' updated_at after a targeted item write, so the editor's autosave can't
 *  quietly win a race against it. Shared by the Compare-side writers below. */
function touchSetupsForItems(db: ReturnType<typeof getDb>, itemIds: number[]): void {
  if (itemIds.length === 0) return
  const placeholders = itemIds.map(() => '?').join(',')
  db.prepare(
    `UPDATE setups SET updated_at = datetime('now')
      WHERE id IN (SELECT DISTINCT setup_id FROM setup_items WHERE id IN (${placeholders}))`
  ).run(...itemIds)
}

/** Links rows into a mic group (a stereo pair), straight from the Compare grid.
 *
 *  Only the group id is written — no mic/preamp/48V/outboard auto-fill. The setup sheet does copy
 *  those on link, but there the two rows are side by side under the cursor; in a grid of several
 *  bands a click that silently rewrote gear in another column would be unpredictable, and the mic
 *  is directly editable in Compare anyway.
 *
 *  A row belongs to at most one group, so any group the incoming rows already sit in is dissolved
 *  first — otherwise linking (2,3) after (1,2) would strand row 1 holding a group id with nobody
 *  left in it. That mirrors the sheet's own steal-from-neighbour rule. */
export function linkComparisonItems(itemIds: number[], groupId: string): void {
  if (itemIds.length < 2) return
  const db = getDb()
  const link = db.transaction(() => {
    const placeholders = itemIds.map(() => '?').join(',')
    const existing = db
      .prepare(`SELECT DISTINCT setup_id, group_id FROM setup_items WHERE id IN (${placeholders}) AND group_id IS NOT NULL`)
      .all(...itemIds) as { setup_id: number; group_id: string }[]
    // Scoped by (setup_id, group_id), never group_id alone: sibling setups are created by copying,
    // and copyItemsToSetup carries group_id across verbatim, so the same uuid is routinely live in
    // more than one band. Clearing on the id alone would unlink an unrelated band's pair.
    for (const row of existing) {
      db.prepare('UPDATE setup_items SET group_id = NULL WHERE setup_id = ? AND group_id = ?').run(
        row.setup_id,
        row.group_id
      )
    }
    db.prepare(
      `UPDATE setup_items SET group_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`
    ).run(groupId, ...itemIds)
    touchSetupsForItems(db, itemIds)
  })
  link()
}

/** Dissolves one band's mic group. Takes the setup id as well as the group id for the same reason
 *  as above — the uuid alone is not unique across bands.
 *
 *  Clears every member rather than just the two the caller can see: duplicating a linked row copies
 *  its group id, so a group of three does occur in the wild, and leaving a stray third row holding
 *  a dead id would be worse than the link the user just asked to remove. */
export function unlinkComparisonGroup(setupId: number, groupId: string): void {
  const db = getDb()
  const unlink = db.transaction(() => {
    const members = db
      .prepare('SELECT id FROM setup_items WHERE setup_id = ? AND group_id = ?')
      .all(setupId, groupId) as { id: number }[]
    if (members.length === 0) return
    db.prepare(
      `UPDATE setup_items SET group_id = NULL, updated_at = datetime('now')
        WHERE setup_id = ? AND group_id = ?`
    ).run(setupId, groupId)
    touchSetupsForItems(
      db,
      members.map((m) => m.id)
    )
  })
  unlink()
}

export interface AlignMultiSetupRowInput {
  multiSetupId: number
  /** The row whose patch fields every other member's matching row is copied FROM. */
  referenceItemId: number
}

interface AlignSourceRow {
  id: number
  setup_id: number
  source_name: string
  channel: number | null
  tie_line: number | null
  cue_box: number | null
  mic_id: number | null
  mic_text: string | null
  preamp_id: number | null
  preamp_text: string | null
  phantom_power: number
  polarity_flip: number
}

/** Copies the reference row's "how it's plugged in" fields onto the corresponding row in every
 *  OTHER member, in one transaction.
 *
 *  NOT copied: source_name/instrument_type (the row's identity — copying would silently rename a
 *  band's source), notes (per-band annotation), color, and group_id (a client-generated id shared
 *  between rows WITHIN one sheet, so copying it across sheets would fabricate cross-sheet groups).
 *
 *  Deliberately never creates a row in a band that lacks the source — that band isn't miswired,
 *  it's playing something different, and inventing a row would be the tool guessing at the session.
 *
 *  Channel collisions are tolerated, not prevented: the Compare view refetches straight afterward
 *  and shows the doubled-up channel as a mismatch, which is a better surface than blocking would
 *  be (and matches how the app already treats tie line conflicts). */
export function alignMultiSetupRow(input: AlignMultiSetupRowInput): { updatedItemIds: number[] } {
  const db = getDb()
  const align = db.transaction(() => {
    const reference = db
      .prepare(
        `SELECT id, setup_id, source_name, channel, tie_line, cue_box, mic_id, mic_text,
                preamp_id, preamp_text, phantom_power, polarity_flip
           FROM setup_items WHERE id = ?`
      )
      .get(input.referenceItemId) as AlignSourceRow | undefined
    if (!reference) throw new Error('Reference row not found')

    const memberIds = listMultiSetupMembers(input.multiSetupId).map((m) => m.id)
    const targetSetupIds = memberIds.filter((id) => id !== reference.setup_id)
    if (targetSetupIds.length === 0) return []

    // Matched by channel number: Compare is a channel-keyed grid, so "the corresponding row" is
    // the row on the same channel. A row with no channel has no counterpart to align.
    if (reference.channel == null) return []
    const placeholders = targetSetupIds.map(() => '?').join(',')
    const targets = db
      .prepare(
        `SELECT id, setup_id, source_name, channel, tie_line, cue_box, mic_id, mic_text,
                preamp_id, preamp_text, phantom_power, polarity_flip
           FROM setup_items WHERE setup_id IN (${placeholders}) AND channel = ?`
      )
      .all(...targetSetupIds, reference.channel) as AlignSourceRow[]

    const update = db.prepare(
      `UPDATE setup_items SET
         channel = @channel, tie_line = @tieLine, cue_box = @cueBox,
         mic_id = @micId, mic_text = @micText,
         preamp_id = @preampId, preamp_text = @preampText,
         phantom_power = @phantomPower, polarity_flip = @polarityFlip,
         updated_at = datetime('now')
       WHERE id = @id`
    )
    const deleteOutboards = db.prepare('DELETE FROM setup_item_outboards WHERE setup_item_id = ?')
    const referenceOutboards = db
      .prepare('SELECT slot_index, outboard_id, outboard_text FROM setup_item_outboards WHERE setup_item_id = ?')
      .all(reference.id) as { slot_index: number; outboard_id: number | null; outboard_text: string | null }[]
    const insertOutboard = db.prepare(
      `INSERT INTO setup_item_outboards (setup_item_id, slot_index, outboard_id, outboard_text)
       VALUES (?, ?, ?, ?)`
    )

    for (const target of targets) {
      update.run({
        id: target.id,
        channel: reference.channel,
        tieLine: reference.tie_line,
        cueBox: reference.cue_box,
        micId: reference.mic_id,
        micText: reference.mic_text,
        preampId: reference.preamp_id,
        preampText: reference.preamp_text,
        phantomPower: reference.phantom_power,
        polarityFlip: reference.polarity_flip
      })
      // Slots are replaced wholesale, the same way replaceItemsForSetup handles them — they have no
      // independent identity worth preserving.
      deleteOutboards.run(target.id)
      for (const slot of referenceOutboards) {
        insertOutboard.run(target.id, slot.slot_index, slot.outboard_id, slot.outboard_text)
      }
    }

    for (const setupId of new Set(targets.map((t) => t.setup_id))) {
      db.prepare(`UPDATE setups SET updated_at = datetime('now') WHERE id = ?`).run(setupId)
    }
    return targets.map((t) => t.id)
  })
  return { updatedItemIds: align() }
}

/** How many setups a "delete this Multi Setup" would take with it, for the confirmation copy. */
export function getMultiSetupDeleteImpact(id: number): { setupCount: number } {
  const row = getDb().prepare('SELECT COUNT(*) c FROM setups WHERE multi_setup_id = ?').get(id) as { c: number }
  return { setupCount: row.c }
}

/** Moving a Multi Setup moves the whole session. Its members' folder_id IS the group's folder
 *  (there's no multi_setups.folder_id — see Home's groupFolderId), so one UPDATE keeps the derived
 *  folder and reality identical. */
export function moveMultiSetupToFolder(multiSetupId: number, folderId: number | null): void {
  getDb().prepare('UPDATE setups SET folder_id = ? WHERE multi_setup_id = ?').run(folderId, multiSetupId)
}

/** Deletes every member setup and the group row. Goes through setupsRepo.removeSetups so items,
 *  outboard slots and layout blocks cascade exactly as a single-setup delete does — and so that
 *  function's dissolve usually removes the group row before we get to it. The explicit DELETE is
 *  belt-and-braces for the empty-group case. */
export function removeMultiSetupsCascade(ids: number[]): void {
  if (ids.length === 0) return
  const db = getDb()
  const placeholders = ids.map(() => '?').join(',')
  const remove = db.transaction(() => {
    const memberIds = (
      db
        .prepare(`SELECT id FROM setups WHERE multi_setup_id IN (${placeholders})`)
        .all(...ids) as { id: number }[]
    ).map((r) => r.id)
    removeSetups(memberIds)
    db.prepare(`DELETE FROM multi_setups WHERE id IN (${placeholders})`).run(...ids)
  })
  remove()
}
