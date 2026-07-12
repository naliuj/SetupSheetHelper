import type { SetupColumnKey } from '../constants/setupColumns'

export type SetupKind = 'setup' | 'template'
export type TemplateSource = 'berklee' | 'custom'

export interface Folder {
  id: number
  name: string
  parentFolderId: number | null
  createdAt: string
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
  outboardColumnCount: number
  /** Which toggleable columns this setup shows (see SetupColumnKey). Snapshotted from the global
   *  default when the setup is created, then owned by the setup. Always resolved to a concrete
   *  list on read — a null DB value (pre-feature setups) means every column is shown. */
  visibleColumns: SetupColumnKey[]
}

export interface SetupWithItems extends Setup {
  items: SetupItem[]
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
