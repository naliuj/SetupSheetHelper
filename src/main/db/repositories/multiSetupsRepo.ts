import type { MultiSetup, MultiSetupMember, Setup } from '@shared/types/setup'
import { getDb } from '../index'
import { createSetup } from './setupsRepo'

interface MultiSetupRow {
  id: number
  studio_id: number
  name: string
  created_at: string
}

function mapRow(row: MultiSetupRow): MultiSetup {
  return { id: row.id, studioId: row.studio_id, name: row.name, createdAt: row.created_at }
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
