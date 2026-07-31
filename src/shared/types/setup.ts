import type { SetupColumnKey } from '../constants/setupColumns'

export type SetupKind = 'setup' | 'template'
export type TemplateSource = 'berklee' | 'custom'
/** Table vs. Layout mode in the Setup Editor. */
export type EditorMode = 'table' | 'layout'

/** Which entity a `folders` row organizes. Studio folders and setup folders are independent
 *  namespaces — a folder created in one never appears in the other. (Channel presets have their
 *  own separate `preset_folders` table and are not part of this scope.) */
export type FolderScope = 'studio' | 'setup'

export interface Folder {
  id: number
  name: string
  parentFolderId: number | null
  createdAt: string
  /** Set for studio/setup folders (the `folders` table). Absent for preset folders, which live in
   *  the separate `preset_folders` table and carry no scope. */
  scope?: FolderScope
}

/** A folder plus its direct children, recursively — for tree UIs (Manage modal, folder pickers). */
export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[]
}

/** One "Outboard" column's value for a row — a setup can have any number of these columns
 *  (see Setup.outboardColumnCount), and a given row may simply not have a slot yet for an
 *  index beyond what it's filled in (absent, not necessarily null-valued). */
export interface SetupItemOutboardSlot {
  slotIndex: number
  outboardId: number | null
  outboardText: string | null
}

export interface SetupItem {
  id: number
  setupId: number
  instrumentType: string
  sourceName: string
  micId: number | null
  micText: string | null
  phantomPower: boolean
  channel: number | null
  tieLine: number | null
  cueBox: number | null
  outboards: SetupItemOutboardSlot[]
  preampId: number | null
  preampText: string | null
  polarityFlip: boolean
  notes: string | null
  /** Optional row tint (hex from the fixed swatch palette), for visually grouping rows. */
  color: string | null
  /** Client-generated id shared by every row in a mic group (e.g. a stereo pair or array).
   *  Null means this row isn't linked to any others. No separate role/label field — use Notes
   *  for that; this only drives the bracket visual and the mic auto-fill convenience on link. */
  groupId: string | null
}

/** Layout Mode's canvas blocks — a purely spatial "where does everyone stand" visualization,
 *  entirely independent of SetupItem/Table Mode. label/shape/color are inline per block (no
 *  shared catalog lookup), copied in at creation time from a palette drag or the one-off
 *  custom-block prompt. */
export interface RoomLayoutBlock {
  id: number
  setupId: number
  label: string
  shape: 'rect' | 'circle'
  color: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  /** Optional musician/player name, so the canvas can double as a seating chart. Blank for
   *  ordinary gear blocks — purely additive, doesn't change rendering unless set. */
  personName: string | null
}

export interface Setup {
  id: number
  studioId: number
  name: string
  sessionDate: string | null
  engineer: string | null
  artist: string | null
  kind: SetupKind
  templateSource: TemplateSource | null
  folderId: number | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  /** Off by default — students don't have access to faculty reserve gear. The sole gate for
   *  whether this setup can see it, regardless of which studio it belongs to. */
  facultyReserveEnabled: boolean
  /** How many "Outboard" columns this setup's table currently has — every row conceptually has
   *  this many slots (see SetupItemOutboardSlot), though a given row may not have filled in
   *  every one yet. Defaults to 1; "+ Add Outboard Column" increments it. */
  /** Which mode (table/layout) this setup was last viewed in — restored when the setup is
   *  reopened, independent of any other setup's mode. New setups start at 'table'. */
  lastEditorMode: EditorMode
  outboardColumnCount: number
  /** Which toggleable columns this setup shows (see SetupColumnKey). Snapshotted from the global
   *  default when the setup is created, then owned by the setup. Always resolved to a concrete
   *  list on read — a null DB value (pre-feature setups) means every column is shown. */
  visibleColumns: SetupColumnKey[]
  /** Free-text session notes (tuning reference, mic-array spacing, or anything else) — deliberately
   *  unstructured. Null/blank means nothing to show in Setup Settings or on the PDF export. */
  sessionNotes: string | null
  /** Which Multi Setup (see MultiSetup below) this setup is grouped into, if any. Null for a
   *  standalone setup. */
  multiSetupId: number | null
}

export interface SetupWithItems extends Setup {
  items: SetupItem[]
}

/** Groups several independent Setups (e.g. one per band in a multi-act recording session) that
 *  share a studio, so the editor can offer a tab strip between them — see MultiSetupTabs.tsx.
 *  Deliberately not called "session": Setup already owns sessionDate/sessionNotes. */
export interface MultiSetup {
  id: number
  studioId: number
  name: string
  createdAt: string
  /** Member the group was last opened at — Home's grouped card reopens here. Null until the first
   *  open, or after that member is deleted (the FK is ON DELETE SET NULL). */
  lastSetupId: number | null
}

/** Ordered member of a Multi Setup — just enough to render a tab strip button. */
export interface MultiSetupMember {
  id: number
  name: string
}

/** One member's row, flattened to just what the Compare grid renders and aligns on.
 *
 *  Everything below `sourceName` is a *patch* field — how the source is physically plugged in — and
 *  the set is deliberately identical to what alignMultiSetupRow writes. Compare's "needs
 *  changeover" test runs over exactly these, so the grid can never call a row matched while the
 *  Match action would silently rewrite it. Adding a field to one means adding it to the other. */
export interface MultiSetupComparisonItem {
  itemId: number
  sourceName: string
  channel: number | null
  /** Resolved main-side (the catalog mic's name, else the free-text micText). Must be resolved
   *  there, not in the renderer: catalogStore only holds mics available to the OPEN setup, and a
   *  sibling band can reference one filtered out of that list. */
  micLabel: string | null
  /** The catalog mic itself, for the picker's selected state and per-column usage counts. Null for
   *  an unset mic OR a free-text one — micLabel is what to display, this is what to edit. */
  micId: number | null
  /** Carried solely so a mic picked here can keep the row's "[Faculty Reserve]"-style pool tag in
   *  step, exactly as picking one in the setup sheet does (see applyMicPoolNotesTag). Never
   *  compared and never displayed. */
  notes: string | null
  /** Mic-group (stereo pair) membership. Deliberately NOT part of the changeover comparison —
   *  unlinking a pair re-labels a sheet, it doesn't move a cable.
   *
   *  Never compare this across columns. Sibling setups are created by copying, and copyItemsToSetup
   *  copies group_id verbatim, so two different bands routinely hold the SAME uuid by accident.
   *  Group identity is only ever `(setupId, groupId)`. */
  groupId: string | null
  /** The row's position in its own sheet. Compare orders rows by channel, so this is the only way
   *  to know whether two rows are actually neighbours in the band they belong to — which is what
   *  linking a stereo pair requires. */
  sortOrder: number
  /** Same resolution rule as micLabel, against the preamps catalog. */
  preampLabel: string | null
  tieLine: number | null
  cueBox: number | null
  phantomPower: boolean
  polarityFlip: boolean
  /** One entry per filled outboard slot, in slot order, each resolved like micLabel. Slots have no
   *  identity of their own (align replaces them wholesale), so this is a plain ordered list. */
  outboardLabels: string[]
}

export interface MultiSetupComparisonMember {
  setupId: number
  name: string
  /** Per-setup, and independently togglable after the group is created — so two bands in one Multi
   *  Setup can genuinely see different mic pools. Compare fetches each column's pool with this. */
  facultyReserveEnabled: boolean
  items: MultiSetupComparisonItem[]
}

export interface MultiSetupComparison {
  multiSetup: MultiSetup
  /** Column order — matches the editor's tab strip (sort_order, id). */
  members: MultiSetupComparisonMember[]
  /** Quick Setup studios have no gear catalog, so their sheets take free-text mics instead of a
   *  picker. Studio-level, and one Multi Setup is one studio, so it's a single flag for the group. */
  studioIsTemporary: boolean
}

/** Renderer-side working copy of a SetupItem. Unsaved items carry a client-generated string id. */
export interface SetupItemDraft extends Omit<SetupItem, 'id' | 'setupId'> {
  id: number | string
}

/** Renderer-side working copy of a RoomLayoutBlock. Unsaved blocks carry a client-generated
 *  string id. */
export interface RoomLayoutBlockDraft extends Omit<RoomLayoutBlock, 'id' | 'setupId'> {
  id: number | string
}
