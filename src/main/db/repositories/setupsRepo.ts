import type { EditorMode, Setup, SetupKind, SetupWithItems, TemplateSource } from '@shared/types/setup'
import type { SetupsListFilter } from '@shared/types/ipc'
import type { SetupColumnKey } from '@shared/constants/setupColumns'
import {
  parseVisibleColumns,
  serializeVisibleColumns,
  parseColumnOrder,
  serializeColumnOrder
} from '@shared/constants/setupColumns'
import { APP_SETTINGS_KEYS } from '@shared/types/entities'
import { getDb } from '../index'
import { getSetting } from './settingsRepo'
import { listItemsBySetup, copyItemsToSetup } from './setupItemsRepo'
import { copyBlocksToSetup } from './roomLayoutBlocksRepo'
import { getSetupLayoutOverride, upsertBlankLayoutOverride, upsertFileLayoutOverride } from './setupLayoutOverrideRepo'

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
  visible_columns: string | null
  column_order: string | null
  session_notes: string | null
  last_editor_mode: EditorMode
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
    outboardColumnCount: row.outboard_column_count,
    visibleColumns: parseVisibleColumns(row.visible_columns),
    columnOrder: parseColumnOrder(row.column_order),
    sessionNotes: row.session_notes,
    lastEditorMode: row.last_editor_mode
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
  facultyReserveEnabled = false,
  sessionNotes: string | null = null
): Setup {
  const db = getDb()
  // Snapshot the global default columns at creation, so the setup owns its columns from here on and
  // later changes to the default never retroactively alter it. Null default → null (shows all).
  const defaultVisibleColumns = getSetting(APP_SETTINGS_KEYS.defaultVisibleColumns)
  const defaultColumnOrder = getSetting(APP_SETTINGS_KEYS.defaultColumnOrder)
  const info = db
    .prepare(
      'INSERT INTO setups (studio_id, name, session_date, kind, template_source, folder_id, engineer, artist, faculty_reserve_enabled, visible_columns, column_order, session_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      studioId,
      name,
      sessionDate,
      kind,
      templateSource,
      folderId,
      engineer,
      artist,
      facultyReserveEnabled ? 1 : 0,
      defaultVisibleColumns,
      defaultColumnOrder,
      sessionNotes
    )
  const row = db.prepare('SELECT * FROM setups WHERE id = ?').get(info.lastInsertRowid) as SetupRow
  return mapRow(row)
}

export function setVisibleColumns(id: number, columns: SetupColumnKey[]): void {
  getDb().prepare('UPDATE setups SET visible_columns = ? WHERE id = ?').run(serializeVisibleColumns(columns), id)
}

export function setColumnOrder(id: number, order: SetupColumnKey[]): void {
  getDb().prepare('UPDATE setups SET column_order = ? WHERE id = ?').run(serializeColumnOrder(order), id)
}

export function setLastEditorMode(id: number, mode: EditorMode): void {
  getDb().prepare('UPDATE setups SET last_editor_mode = ? WHERE id = ?').run(mode, id)
}

export function renameSetup(
  id: number,
  name: string,
  sessionDate: string | null,
  engineer: string | null = null,
  artist: string | null = null,
  facultyReserveEnabled = false,
  sessionNotes: string | null = null
): void {
  getDb()
    .prepare(
      `UPDATE setups SET name = ?, session_date = ?, engineer = ?, artist = ?, faculty_reserve_enabled = ?, session_notes = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .run(name, sessionDate, engineer, artist, facultyReserveEnabled ? 1 : 0, sessionNotes, id)
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

export function removeSetups(ids: number[]): void {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(',')
  getDb()
    .prepare(`DELETE FROM setups WHERE id IN (${placeholders})`)
    .run(...ids)
}

/** Lightweight reparent for drag-to-folder — doesn't touch name/updated_at. */
export function moveSetupToFolder(id: number, folderId: number | null): void {
  getDb().prepare('UPDATE setups SET folder_id = ? WHERE id = ?').run(folderId, id)
}

/** Bulk variant — dragging a multi-selection onto a folder in Manage Setups. Same single
 *  statement shape as removeSetups above, since reparenting (unlike delete) has no cascade to
 *  worry about. */
export function moveSetupsToFolder(ids: number[], folderId: number | null): void {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(',')
  getDb()
    .prepare(`UPDATE setups SET folder_id = ? WHERE id IN (${placeholders})`)
    .run(folderId, ...ids)
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
  // Column layout is part of the reusable structure (which columns, in what order) — without
  // this, every sheet made from the template reverted to the global default and a column the
  // user hides kept "coming back." Mirrors duplicateSetup below.
  setOutboardColumnCount(template.id, source.outboardColumnCount)
  setVisibleColumns(template.id, source.visibleColumns)
  setColumnOrder(template.id, source.columnOrder)
  copyItemsToSetup(setupId, template.id, { blankRoomSpecificFields: true })
  return template
}

/**
 * Full copy of an existing setup, under a new name/date/folder — unlike saveAsTemplate/
 * instantiateFromTemplate (which deliberately blank room-specific fields for a reusable
 * template), this carries every table field verbatim, plus the source's Layout Mode blocks and
 * room layout override, so the duplicate opens looking exactly like the setup it was copied
 * from. outboardColumnCount/visibleColumns are copied explicitly since createSetup only seeds
 * those from the global default, not from the source.
 */
export function duplicateSetup(
  sourceSetupId: number,
  name: string,
  sessionDate: string | null,
  folderId: number | null,
  engineer: string | null,
  artist: string | null,
  facultyReserveEnabled: boolean
): Setup {
  const source = getSetupWithItems(sourceSetupId)
  if (!source) throw new Error('Setup not found')
  const setup = createSetup(
    source.studioId,
    name,
    sessionDate,
    'setup',
    null,
    folderId,
    engineer,
    artist,
    facultyReserveEnabled,
    source.sessionNotes
  )
  setOutboardColumnCount(setup.id, source.outboardColumnCount)
  setVisibleColumns(setup.id, source.visibleColumns)
  setColumnOrder(setup.id, source.columnOrder)
  copyItemsToSetup(sourceSetupId, setup.id)
  copyBlocksToSetup(sourceSetupId, setup.id)
  const override = getSetupLayoutOverride(sourceSetupId)
  if (override?.kind === 'blank') {
    upsertBlankLayoutOverride(setup.id)
  } else if (override?.kind === 'file' && override.filePath) {
    upsertFileLayoutOverride({
      setupId: setup.id,
      filePath: override.filePath,
      originalName: override.originalName,
      pageWidthPt: override.pageWidthPt,
      pageHeightPt: override.pageHeightPt
    })
  }
  return setup
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
  // Carry the template's column layout onto the new sheet (see saveAsTemplate's note).
  setOutboardColumnCount(setup.id, template.outboardColumnCount)
  setVisibleColumns(setup.id, template.visibleColumns)
  setColumnOrder(setup.id, template.columnOrder)
  copyItemsToSetup(templateId, setup.id)
  return setup
}
