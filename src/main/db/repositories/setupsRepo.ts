import type { Setup, SetupKind, SetupWithItems, TemplateSource } from '@shared/types/setup'
import type { SetupsListFilter } from '@shared/types/ipc'
import { getDb } from '../index'
import { listItemsBySetup, copyItemsToSetup } from './setupItemsRepo'

interface SetupRow {
  id: number
  studio_id: number
  name: string
  session_date: string | null
  engineer: string | null
  artist: string | null
  kind: SetupKind
  template_source: TemplateSource | null
  folder_id: number | null
  sort_order: number
  created_at: string
  updated_at: string
  faculty_reserve_enabled: number
  outboard_column_count: number
}

function mapRow(row: SetupRow): Setup {
  return {
    id: row.id,
    studioId: row.studio_id,
    name: row.name,
    sessionDate: row.session_date,
    engineer: row.engineer,
    artist: row.artist,
    kind: row.kind,
    templateSource: row.template_source,
    folderId: row.folder_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    facultyReserveEnabled: row.faculty_reserve_enabled === 1,
    outboardColumnCount: row.outboard_column_count
  }
}

/** Plain setups only (kind='setup') for a studio, or all studios — used by the studio picker's "Saved Setups" list. */
export function listSetups(studioId?: number): Setup[] {
  const db = getDb()
  const rows = (
    studioId
      ? db
          .prepare(`SELECT * FROM setups WHERE studio_id = ? AND kind = 'setup' ORDER BY sort_order, updated_at DESC`)
          .all(studioId)
      : db.prepare(`SELECT * FROM setups WHERE kind = 'setup' ORDER BY sort_order, updated_at DESC`).all()
  ) as SetupRow[]
  return rows.map(mapRow)
}

/** General-purpose query used by the home screen (Recent / Berklee Studios / Custom Studios). */
export function listSetupsByKind(filter: SetupsListFilter): Setup[] {
  const clauses: string[] = []
  const params: unknown[] = []
  if (filter.studioId != null) {
    clauses.push('studio_id = ?')
    params.push(filter.studioId)
  }
  if (filter.kind) {
    clauses.push('kind = ?')
    params.push(filter.kind)
  }
  if (filter.templateSource) {
    clauses.push('template_source = ?')
    params.push(filter.templateSource)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = getDb()
    .prepare(`SELECT * FROM setups ${where} ORDER BY sort_order, updated_at DESC`)
    .all(...params) as SetupRow[]
  return rows.map(mapRow)
}

export function getSetupWithItems(id: number): SetupWithItems | null {
  const row = getDb().prepare('SELECT * FROM setups WHERE id = ?').get(id) as SetupRow | undefined
  if (!row) return null
  return { ...mapRow(row), items: listItemsBySetup(id) }
}

export function createSetup(
  studioId: number,
  name: string,
  sessionDate: string | null,
  kind: SetupKind = 'setup',
  templateSource: TemplateSource | null = null,
  folderId: number | null = null,
  engineer: string | null = null,
  artist: string | null = null,
  facultyReserveEnabled = false
): Setup {
  const db = getDb()
  const info = db
    .prepare(
      'INSERT INTO setups (studio_id, name, session_date, kind, template_source, folder_id, engineer, artist, faculty_reserve_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(studioId, name, sessionDate, kind, templateSource, folderId, engineer, artist, facultyReserveEnabled ? 1 : 0)
  const row = db.prepare('SELECT * FROM setups WHERE id = ?').get(info.lastInsertRowid) as SetupRow
  return mapRow(row)
}

export function renameSetup(
  id: number,
  name: string,
  sessionDate: string | null,
  engineer: string | null = null,
  artist: string | null = null,
  facultyReserveEnabled = false
): void {
  getDb()
    .prepare(
      `UPDATE setups SET name = ?, session_date = ?, engineer = ?, artist = ?, faculty_reserve_enabled = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .run(name, sessionDate, engineer, artist, facultyReserveEnabled ? 1 : 0, id)
}

export function touchSetup(id: number): void {
  getDb().prepare(`UPDATE setups SET updated_at = datetime('now') WHERE id = ?`).run(id)
}

/** "+ Add Outboard Column" bumps this sheet-wide — every row conceptually gains one more
 *  outboard slot, though rows only actually get a setup_item_outboards row once filled in. */
export function setOutboardColumnCount(id: number, count: number): void {
  getDb().prepare('UPDATE setups SET outboard_column_count = ? WHERE id = ?').run(count, id)
}

export function removeSetup(id: number): void {
  getDb().prepare('DELETE FROM setups WHERE id = ?').run(id)
}

/** Lightweight reparent for drag-to-folder — doesn't touch name/updated_at. */
export function moveSetupToFolder(id: number, folderId: number | null): void {
  getDb().prepare('UPDATE setups SET folder_id = ? WHERE id = ?').run(folderId, id)
}

/** Batch reorder within a folder — assigns sequential sort_order in the given id order. */
export function reorderSetups(ids: number[]): void {
  const db = getDb()
  const run = db.transaction(() => {
    const stmt = db.prepare('UPDATE setups SET sort_order = ? WHERE id = ?')
    ids.forEach((id, index) => stmt.run(index, id))
  })
  run()
}

/**
 * "Save as Studio": duplicates the given setup's items into a new studio-bound template
 * row, stripping specific mic/outboard/channel/tie line/cue box/notes — a template is a
 * reusable structure (which sources, what role), not a snapshot of one day's actual gear.
 */
export function saveAsTemplate(setupId: number, name: string, folderId: number | null = null): Setup {
  const source = getSetupWithItems(setupId)
  if (!source) throw new Error('Setup not found')
  const template = createSetup(source.studioId, name, null, 'template', 'custom', folderId)
  copyItemsToSetup(setupId, template.id, { blankRoomSpecificFields: true })
  return template
}

/** Instantiates a brand-new editable Setup from a template's item list. */
export function instantiateFromTemplate(templateId: number): Setup {
  const template = getSetupWithItems(templateId)
  if (!template) throw new Error('Template not found')
  const setup = createSetup(
    template.studioId,
    template.name,
    new Date().toISOString().slice(0, 10),
    'setup',
    null
  )
  copyItemsToSetup(templateId, setup.id)
  return setup
}
