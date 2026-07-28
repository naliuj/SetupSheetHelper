import type {
  MultiSetup,
  MultiSetupComparison,
  MultiSetupComparisonItem,
  MultiSetupMember,
  MultiSetupSourceLink,
  Setup
} from '@shared/types/setup'
import { normalizeSourceName } from '@shared/utils/normalizeSourceName'
import { getDb } from '../index'
import { createSetup, removeSetups } from './setupsRepo'

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
}

/** The bits a sibling setup should inherit from the one it's being grouped with. Bands in one
 *  Multi Setup play the same session in the same room, so date/engineer/faculty-reserve carry
 *  over; `artist` deliberately does not — that's the thing that differs per band. */
function readSessionContext(db: ReturnType<typeof getDb>, setupId: number): SessionContext {
  const row = db
    .prepare('SELECT studio_id, session_date, engineer, faculty_reserve_enabled FROM setups WHERE id = ?')
    .get(setupId) as SessionContext | undefined
  if (!row) throw new Error('Setup not found')
  return row
}

function createInheritingSetup(context: SessionContext, name: string): Setup {
  return createSetup(
    context.studio_id,
    name,
    context.session_date,
    'setup',
    null,
    null,
    context.engineer,
    null,
    context.faculty_reserve_enabled === 1
  )
}

export interface CreateMultiSetupWithSetupsInput {
  sourceSetupId: number
  name: string
  /** Row 1's (possibly edited) name — renames the source setup in place. */
  sourceSetupName: string
  /** One new blank setup per entry. Must be non-empty: a Multi Setup of one setup is just a
   *  setup, and removeSetupFromMultiSetup would dissolve it right back. */
  newSetupNames: string[]
}

/** The only creation path: promotes an existing setup into a new Multi Setup AND creates its
 *  siblings in one transaction, so the group is never persisted in the degenerate one-member
 *  state that removeSetupFromMultiSetup treats as meaningless. */
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
    for (const name of names) {
      const sibling = createInheritingSetup(context, name)
      db.prepare('UPDATE setups SET multi_setup_id = ? WHERE id = ?').run(multiSetupId, sibling.id)
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

/** Creates a brand-new blank setup and links it straight into a Multi Setup — the tab strip's
 *  "New setup" action. Inherits session context from `inheritFromSetupId` (the setup the user has
 *  open), since "add another one alongside this" is the intent — stamping today's date would be
 *  wrong for a session being prepped days ahead. */
export function createSetupInMultiSetup(multiSetupId: number, name: string, inheritFromSetupId: number): Setup {
  const db = getDb()
  const group = db.prepare('SELECT studio_id FROM multi_setups WHERE id = ?').get(multiSetupId) as
    | { studio_id: number }
    | undefined
  if (!group) throw new Error('Multi Setup not found')
  const setup = createInheritingSetup(readSessionContext(db, inheritFromSetupId), name)
  db.prepare('UPDATE setups SET multi_setup_id = ? WHERE id = ?').run(multiSetupId, setup.id)
  return { ...setup, multiSetupId }
}

/** Unlinks one setup from its Multi Setup. A group of 0-1 members means nothing (a "Multi Setup" of
 *  one band is just a setup) — dissolve it; ON DELETE SET NULL clears the last remaining member's
 *  multi_setup_id for free. */
export function removeSetupFromMultiSetup(setupId: number): void {
  const db = getDb()
  const remove = db.transaction(() => {
    const setup = db.prepare('SELECT multi_setup_id FROM setups WHERE id = ?').get(setupId) as
      | { multi_setup_id: number | null }
      | undefined
    if (!setup?.multi_setup_id) return
    const multiSetupId = setup.multi_setup_id
    db.prepare('UPDATE setups SET multi_setup_id = NULL WHERE id = ?').run(setupId)
    const remaining = (
      db.prepare('SELECT COUNT(*) c FROM setups WHERE multi_setup_id = ?').get(multiSetupId) as { c: number }
    ).c
    if (remaining <= 1) db.prepare('DELETE FROM multi_setups WHERE id = ?').run(multiSetupId)
  })
  remove()
}

export function renameMultiSetup(id: number, name: string): void {
  getDb().prepare('UPDATE multi_setups SET name = ? WHERE id = ?').run(name, id)
}

export function listSourceLinks(multiSetupId: number): MultiSetupSourceLink[] {
  const rows = getDb()
    .prepare('SELECT link_key, source_name FROM multi_setup_source_links WHERE multi_setup_id = ? ORDER BY link_key')
    .all(multiSetupId) as { link_key: string; source_name: string }[]
  const byKey = new Map<string, string[]>()
  for (const row of rows) {
    const names = byKey.get(row.link_key) ?? []
    names.push(row.source_name)
    byKey.set(row.link_key, names)
  }
  return [...byKey].map(([linkKey, sourceNames]) => ({ linkKey, sourceNames }))
}

/** Declares a set of source names equivalent. Merges into any link group the names already belong
 *  to, so linking A→B then B→C leaves one group of three rather than two overlapping pairs (the
 *  UNIQUE(multi_setup_id, source_name) constraint makes overlapping groups impossible anyway). */
export function linkSources(multiSetupId: number, sourceNames: string[]): void {
  const names = [...new Set(sourceNames.map(normalizeSourceName).filter(Boolean))]
  if (names.length < 2) return
  const db = getDb()
  const placeholders = names.map(() => '?').join(',')
  const link = db.transaction(() => {
    const existing = db
      .prepare(
        `SELECT DISTINCT link_key FROM multi_setup_source_links
          WHERE multi_setup_id = ? AND source_name IN (${placeholders})`
      )
      .all(multiSetupId, ...names) as { link_key: string }[]
    // Reuse an existing group's key when there is one, so a name joining an established set doesn't
    // orphan the rest of it.
    const linkKey = existing[0]?.link_key ?? `link-${names[0]}-${Date.now()}`
    if (existing.length > 1) {
      const keys = existing.map((e) => e.link_key)
      db.prepare(
        `UPDATE multi_setup_source_links SET link_key = ?
          WHERE multi_setup_id = ? AND link_key IN (${keys.map(() => '?').join(',')})`
      ).run(linkKey, multiSetupId, ...keys)
    }
    const insert = db.prepare(
      `INSERT INTO multi_setup_source_links (multi_setup_id, link_key, source_name) VALUES (?, ?, ?)
       ON CONFLICT(multi_setup_id, source_name) DO UPDATE SET link_key = excluded.link_key`
    )
    for (const name of names) insert.run(multiSetupId, linkKey, name)
  })
  link()
}

/** Drops one name out of its link group. Any group left with a single name is removed outright —
 *  a "these are the same" set of one says nothing. */
export function unlinkSource(multiSetupId: number, sourceName: string): void {
  const db = getDb()
  const normalized = normalizeSourceName(sourceName)
  const unlink = db.transaction(() => {
    const row = db
      .prepare('SELECT link_key FROM multi_setup_source_links WHERE multi_setup_id = ? AND source_name = ?')
      .get(multiSetupId, normalized) as { link_key: string } | undefined
    if (!row) return
    db.prepare('DELETE FROM multi_setup_source_links WHERE multi_setup_id = ? AND source_name = ?').run(
      multiSetupId,
      normalized
    )
    const remaining = (
      db
        .prepare('SELECT COUNT(*) c FROM multi_setup_source_links WHERE multi_setup_id = ? AND link_key = ?')
        .get(multiSetupId, row.link_key) as { c: number }
    ).c
    if (remaining <= 1) {
      db.prepare('DELETE FROM multi_setup_source_links WHERE multi_setup_id = ? AND link_key = ?').run(
        multiSetupId,
        row.link_key
      )
    }
  })
  unlink()
}

/** Every member's sheet in one round trip — the Compare grid needs all of them at once, and N×
 *  getSetupWithItems would ship full SetupItems (outboards, notes, colors) it never renders.
 *  Two statements regardless of member count. */
export function getMultiSetupComparison(multiSetupId: number): MultiSetupComparison | null {
  const db = getDb()
  const multiSetup = getMultiSetup(multiSetupId)
  if (!multiSetup) return null

  const members = listMultiSetupMembers(multiSetupId)
  if (members.length === 0) {
    return { multiSetup, members: [], links: listSourceLinks(multiSetupId) }
  }

  const placeholders = members.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT si.setup_id, si.id, si.source_name, si.channel, si.mic_text, m.name AS mic_name
         FROM setup_items si
         LEFT JOIN mics m ON m.id = si.mic_id
        WHERE si.setup_id IN (${placeholders})
        ORDER BY si.setup_id, si.sort_order, si.id`
    )
    .all(...members.map((m) => m.id)) as {
    setup_id: number
    id: number
    source_name: string
    channel: number | null
    mic_text: string | null
    mic_name: string | null
  }[]

  const itemsBySetup = new Map<number, MultiSetupComparisonItem[]>()
  for (const row of rows) {
    const items = itemsBySetup.get(row.setup_id) ?? []
    items.push({
      itemId: row.id,
      sourceName: row.source_name,
      channel: row.channel,
      micLabel: row.mic_name ?? row.mic_text
    })
    itemsBySetup.set(row.setup_id, items)
  }

  return {
    multiSetup,
    members: members.map((m) => ({ setupId: m.id, name: m.name, items: itemsBySetup.get(m.id) ?? [] })),
    links: listSourceLinks(multiSetupId)
  }
}

export interface AlignMultiSetupRowInput {
  multiSetupId: number
  /** The row whose patch fields every other member's matching row is copied FROM. */
  referenceItemId: number
  /** Which Compare pivot the user was looking at — decides what "the matching row" means.
   *  'channel': rows at the same channel number (fixes the mic/preamp/outboard on a channel that's
   *  already agreed). 'source': rows with the same source key (fixes WHICH channel a source lands
   *  on — the one that actually moves patch work). */
  matchBy: 'channel' | 'source'
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

    const placeholders = targetSetupIds.map(() => '?').join(',')
    let targets: AlignSourceRow[]
    if (input.matchBy === 'channel') {
      if (reference.channel == null) return []
      targets = db
        .prepare(
          `SELECT id, setup_id, source_name, channel, tie_line, cue_box, mic_id, mic_text,
                  preamp_id, preamp_text, phantom_power, polarity_flip
             FROM setup_items WHERE setup_id IN (${placeholders}) AND channel = ?`
        )
        .all(...targetSetupIds, reference.channel) as AlignSourceRow[]
    } else {
      // Filtered in JS with the shared normalizer rather than LOWER()/TRIM() in SQL — SQL can't
      // collapse internal whitespace runs, and a second definition of "same source" is exactly what
      // the shared helper exists to prevent.
      const key = normalizeSourceName(reference.source_name)
      const candidates = db
        .prepare(
          `SELECT id, setup_id, source_name, channel, tie_line, cue_box, mic_id, mic_text,
                  preamp_id, preamp_text, phantom_power, polarity_flip
             FROM setup_items WHERE setup_id IN (${placeholders})`
        )
        .all(...targetSetupIds) as AlignSourceRow[]
      const linkedNames = new Set(
        listSourceLinks(input.multiSetupId).find((l) => l.sourceNames.includes(key))?.sourceNames ?? [key]
      )
      targets = candidates.filter((c) => linkedNames.has(normalizeSourceName(c.source_name)))
    }

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
