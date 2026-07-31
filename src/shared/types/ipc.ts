import type {
  Building,
  EffectiveLayout,
  Mic,
  MicPoolType,
  MicWithStudio,
  OutboardGear,
  OutboardGearWithStudio,
  OutboardPoolType,
  Preamp,
  PreampPoolType,
  RoomLayoutFile,
  SetupLayoutOverride,
  Studio
} from './entities'
import type { ChannelPreset, ChannelPresetItemInput, ChannelPresetWithItems } from './channelPreset'
import type { PaletteItem } from './palette'
import type { SetupColumnKey } from '../constants/setupColumns'
import type {
  EditorMode,
  Folder,
  FolderScope,
  MultiSetup,
  MultiSetupComparison,
  MultiSetupMember,
  RoomLayoutBlock,
  Setup,
  SetupItem,
  SetupItemOutboardSlot,
  SetupKind,
  SetupWithItems,
  TemplateSource
} from './setup'

export const IPC = {
  buildings: {
    list: 'buildings:list',
    create: 'buildings:create',
    rename: 'buildings:rename',
    remove: 'buildings:remove'
  },
  studios: {
    listByBuilding: 'studios:listByBuilding',
    listCustom: 'studios:listCustom',
    get: 'studios:get',
    create: 'studios:create',
    createCustom: 'studios:createCustom',
    createTemporary: 'studios:createTemporary',
    updateCustomDetails: 'studios:updateCustomDetails',
    rename: 'studios:rename',
    remove: 'studios:remove',
    removeMany: 'studios:removeMany',
    exportToFile: 'studios:exportToFile',
    pickImportFile: 'studios:pickImportFile',
    importStudios: 'studios:importStudios',
    moveToFolder: 'studios:moveToFolder',
    reorder: 'studios:reorder',
    getDeleteImpact: 'studios:getDeleteImpact'
  },
  mics: {
    listAvailableForStudio: 'mics:listAvailableForStudio',
    listStudioMics: 'mics:listStudioMics',
    listBuildingPool: 'mics:listBuildingPool',
    listFacultyReserve: 'mics:listFacultyReserve',
    listPersonalPool: 'mics:listPersonalPool',
    listSetupGear: 'mics:listSetupGear',
    listAll: 'mics:listAll',
    listAllWithStudio: 'mics:listAllWithStudio',
    upsert: 'mics:upsert',
    remove: 'mics:remove'
  },
  outboard: {
    listByStudio: 'outboard:listByStudio',
    listAvailableForStudio: 'outboard:listAvailableForStudio',
    listBuildingPool: 'outboard:listBuildingPool',
    listFacultyReserve: 'outboard:listFacultyReserve',
    listPersonalOutboard: 'outboard:listPersonalOutboard',
    listSetupGear: 'outboard:listSetupGear',
    listAll: 'outboard:listAll',
    listAllWithStudio: 'outboard:listAllWithStudio',
    upsert: 'outboard:upsert',
    remove: 'outboard:remove'
  },
  preamps: {
    listByStudio: 'preamps:listByStudio',
    listAvailableForStudio: 'preamps:listAvailableForStudio',
    listBuildingPreamps: 'preamps:listBuildingPreamps',
    listFacultyReservePreamps: 'preamps:listFacultyReservePreamps',
    listPersonalPreamps: 'preamps:listPersonalPreamps',
    listSetupGear: 'preamps:listSetupGear',
    listAll: 'preamps:listAll',
    upsert: 'preamps:upsert',
    remove: 'preamps:remove'
  },
  layoutFile: {
    getForStudio: 'layoutFile:getForStudio',
    importForStudio: 'layoutFile:importForStudio',
    pickFile: 'layoutFile:pickFile',
    commitPickedToStudio: 'layoutFile:commitPickedToStudio',
    commitPickedToSetup: 'layoutFile:commitPickedToSetup',
    setBlankForSetup: 'layoutFile:setBlankForSetup',
    getEffectiveForSetup: 'layoutFile:getEffectiveForSetup'
  },
  presets: {
    list: 'presets:list',
    getWithItems: 'presets:getWithItems',
    create: 'presets:create',
    update: 'presets:update',
    remove: 'presets:remove',
    removeMany: 'presets:removeMany',
    rename: 'presets:rename',
    moveToFolder: 'presets:moveToFolder',
    reorder: 'presets:reorder'
  },
  presetFolders: {
    list: 'presetFolders:list',
    create: 'presetFolders:create',
    rename: 'presetFolders:rename',
    getDeleteImpact: 'presetFolders:getDeleteImpact',
    deleteRecursive: 'presetFolders:deleteRecursive',
    deletePromoteContents: 'presetFolders:deletePromoteContents'
  },
  setups: {
    list: 'setups:list',
    listByKind: 'setups:listByKind',
    getWithItems: 'setups:getWithItems',
    create: 'setups:create',
    rename: 'setups:rename',
    saveItems: 'setups:saveItems',
    setOutboardColumnCount: 'setups:setOutboardColumnCount',
    setVisibleColumns: 'setups:setVisibleColumns',
    setLastEditorMode: 'setups:setLastEditorMode',
    remove: 'setups:remove',
    removeMany: 'setups:removeMany',
    exportToFile: 'setups:exportToFile',
    pickImportFile: 'setups:pickImportFile',
    importSetups: 'setups:importSetups',
    instantiateFromTemplate: 'setups:instantiateFromTemplate',
    saveAsTemplate: 'setups:saveAsTemplate',
    duplicate: 'setups:duplicate',
    moveToFolder: 'setups:moveToFolder',
    reorder: 'setups:reorder'
  },
  multiSetups: {
    listAll: 'multiSetups:listAll',
    getForSetup: 'multiSetups:getForSetup',
    listMembers: 'multiSetups:listMembers',
    createWithSetups: 'multiSetups:createWithSetups',
    addExisting: 'multiSetups:addExisting',
    createAndAdd: 'multiSetups:createAndAdd',
    rename: 'multiSetups:rename',
    recordLastOpened: 'multiSetups:recordLastOpened',
    getDeleteImpact: 'multiSetups:getDeleteImpact',
    moveToFolder: 'multiSetups:moveToFolder',
    removeManyCascade: 'multiSetups:removeManyCascade',
    getComparison: 'multiSetups:getComparison',
    renameItemSource: 'multiSetups:renameItemSource',
    setItemMic: 'multiSetups:setItemMic',
    linkItems: 'multiSetups:linkItems',
    unlinkGroup: 'multiSetups:unlinkGroup',
    alignRow: 'multiSetups:alignRow'
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set'
  },
  app: {
    getVersion: 'app:getVersion'
  },
  feedback: {
    submit: 'feedback:submit'
  },
  berklee: {
    enable: 'berklee:enable',
    disable: 'berklee:disable',
    resetFacultyReserveMics: 'berklee:resetFacultyReserveMics'
  },
  folders: {
    list: 'folders:list',
    create: 'folders:create',
    rename: 'folders:rename',
    getDeleteImpact: 'folders:getDeleteImpact',
    deleteRecursive: 'folders:deleteRecursive',
    deletePromoteContents: 'folders:deletePromoteContents'
  },
  exportPdf: {
    exportSetup: 'exportPdf:exportSetup'
  },
  roomLayoutBlocks: {
    listBySetup: 'roomLayoutBlocks:listBySetup',
    saveForSetup: 'roomLayoutBlocks:saveForSetup'
  },
  palette: {
    listVisible: 'palette:listVisible',
    listAll: 'palette:listAll',
    createCustom: 'palette:createCustom',
    update: 'palette:update',
    removeCustom: 'palette:removeCustom',
    reorder: 'palette:reorder',
    renameCategory: 'palette:renameCategory',
    deleteCategory: 'palette:deleteCategory'
  }
} as const

export interface MicUpsertInput {
  id?: number
  poolType: MicPoolType
  studioId: number | null
  buildingId: number | null
  setupId: number | null
  name: string
  manufacturer: string | null
  category: string | null
  notes: string | null
  quantity?: number
  sortOrder?: number
}

export interface OutboardUpsertInput {
  id?: number
  poolType: OutboardPoolType
  studioId: number | null
  buildingId: number | null
  setupId: number | null
  name: string
  manufacturer: string | null
  category: string | null
  notes: string | null
  quantity?: number
  sortOrder?: number
}

export interface PreampUpsertInput {
  id?: number
  poolType: PreampPoolType
  studioId: number | null
  buildingId: number | null
  setupId: number | null
  name: string
  manufacturer: string | null
  category: string | null
  notes: string | null
  channels?: number
  sortOrder?: number
}

export interface PaletteItemCreateInput {
  label: string
  shape: 'rect' | 'circle'
  color: string
  category: string
}

export interface PaletteItemUpdateInput {
  label?: string
  shape?: 'rect' | 'circle'
  color?: string
  category?: string
  isHidden?: boolean
}

export interface SetupItemInput {
  id: number | string
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
  color: string | null
  groupId: string | null
}

export interface RoomLayoutBlockInput {
  id: number | string
  label: string
  shape: 'rect' | 'circle'
  color: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  personName: string | null
}

export interface ExportedStudioGear {
  name: string
  manufacturer: string | null
  category: string | null
  quantity: number
}

export interface ExportedPreamp {
  name: string
  manufacturer: string | null
  category: string | null
  channels: number
}

export interface ExportedRoomLayoutFile {
  originalName: string | null
  /** e.g. '.pdf', '.png' — matches node:path extname() output, dot included. */
  extension: string
  pageWidthPt: number | null
  pageHeightPt: number | null
  dataBase64: string
}

export interface ExportedStudio {
  name: string
  mics: ExportedStudioGear[]
  outboardGear: ExportedStudioGear[]
  preamps: ExportedPreamp[]
  /** Present (possibly null) in exports from v3+; absent entirely in older files — always read as
   *  `studio.roomLayoutFile ?? null` on import. */
  roomLayoutFile: ExportedRoomLayoutFile | null
}

export interface StudioExportFile {
  version: number
  studios: ExportedStudio[]
}

export interface ExportStudiosResult {
  canceled: boolean
  filePath?: string
}

export interface PickImportFileResult {
  canceled: boolean
  data?: StudioExportFile
  error?: string
}

export interface ExportedSetupItemOutboardSlot {
  slotIndex: number
  outboardName: string | null
  outboardManufacturer: string | null
}

/** Gear FKs (micId/outboardId/preampId) become name/manufacturer pairs — same portability
 *  approach as ChannelPresetItem — since a live catalog id is meaningless outside the
 *  exporting install. Re-resolved by name against the target studio's catalog on import;
 *  unmatched gear is left as plain text rather than auto-created (see importSetups). */
export interface ExportedSetupItem {
  instrumentType: string
  sourceName: string
  micName: string | null
  micManufacturer: string | null
  phantomPower: boolean
  channel: number | null
  tieLine: number | null
  cueBox: number | null
  outboards: ExportedSetupItemOutboardSlot[]
  preampName: string | null
  preampManufacturer: string | null
  polarityFlip: boolean
  notes: string | null
  color: string | null
  groupId: string | null
}

export interface ExportedSetup {
  name: string
  sessionDate: string | null
  engineer: string | null
  artist: string | null
  facultyReserveEnabled: boolean
  outboardColumnCount: number
  visibleColumns: SetupColumnKey[]
  sessionNotes: string | null
  items: ExportedSetupItem[]
  /** This setup's own layout override (rare — most setups use their studio's shared layout and
   *  have no override row at all), not the studio's shared layout file. */
  layoutOverride: ExportedRoomLayoutFile | null
}

export interface SetupExportFile {
  version: number
  setups: ExportedSetup[]
}

export interface ExportSetupsResult {
  canceled: boolean
  filePath?: string
}

export interface PickSetupImportFileResult {
  canceled: boolean
  data?: SetupExportFile
  error?: string
}

export interface ChannelPresetCreateInput {
  name: string
  description: string | null
  items: ChannelPresetItemInput[]
  /** Preset-folder to file a NEW preset under (its own namespace, separate from studio/setup
   *  folders). Applies on create only — folder moves go through presets.moveToFolder. Omitted
   *  leaves the preset unfiled. */
  folderId?: number | null
}

export type PdfExportInclude = 'sheet' | 'layout' | 'both'
export type PdfExportOrientation = 'portrait' | 'landscape'
export type PdfExportDensity = 'normal' | 'compact'

export interface ExportSetupPdfInput {
  setupId: number
  layoutImageDataUrl: string | null
  include: PdfExportInclude
  /** When true, draw each row's color as a pale background tint on the setup sheet. Off by
   *  default — colored rows can hurt legibility when printed in black and white. */
  coloredRows: boolean
  /** Page orientation for the setup-sheet table. Landscape gives wide sheets (many outboard
   *  columns) more horizontal room before columns have to shrink/wrap. */
  orientation: PdfExportOrientation
  /** Text density for the setup-sheet table. Compact uses a smaller font + tighter spacing to
   *  fit more rows per page; normal keeps the larger, more legible size. */
  density: PdfExportDensity
}

export interface ExportSetupPdfResult {
  canceled: boolean
  filePath?: string
}

export interface SetupsListFilter {
  studioId?: number
  kind?: SetupKind
  templateSource?: TemplateSource
}

export interface SaveAsTemplateInput {
  setupId: number
  name: string
  folderId: number | null
}

export interface AlignMultiSetupRowInput {
  multiSetupId: number
  /** The row whose patch fields every other member's matching row is copied FROM. Compare is a
   *  channel-keyed grid, so "the matching row" is the row on the same channel in each target. */
  referenceItemId: number
}

export interface CreateMultiSetupInput {
  sourceSetupId: number
  name: string
  /** The current setup's (possibly edited) name — renames it in place. */
  sourceSetupName: string
  /** One new blank setup per entry; at least one is required. */
  newSetupNames: string[]
}

export interface DuplicateSetupInput {
  sourceSetupId: number
  name: string
  sessionDate: string | null
  folderId: number | null
  engineer: string | null
  artist: string | null
  facultyReserveEnabled: boolean
}

/** What deleting a folder's subtree would remove, for the confirmation prompt. `items` lists the
 *  non-folder contents by singular noun ("studio", "setup", "preset") so the same modal can serve
 *  different item namespaces (studios/setups vs preset folders). */
export interface FolderDeleteImpact {
  folderCount: number
  items: { noun: string; count: number }[]
}

export interface StudioDeleteImpact {
  setupCount: number
  templateCount: number
}

export type FeedbackCategory = 'Feature Request' | 'Bug Report' | 'Other'

export interface FeedbackSubmission {
  category: FeedbackCategory
  name: string
  email: string
  message: string
}

export interface FeedbackSubmitResult {
  ok: boolean
  error?: string
}

export interface PickedLayoutFile {
  sourcePath: string
  fileName: string
}

export const MENU_CHANNEL = 'menu:action'

export type MenuAction =
  | 'save-as-studio'
  | 'save-setup'
  | 'export-pdf'
  | 'toggle-mode'
  | 'add-source'
  | 'select-all'
  | 'delete-selection'
  | 'duplicate-selection'
  | 'sequential-numbering'
  | 'zoom-in'
  | 'zoom-out'
  | 'reset-view'
  | 'open-setup-settings'
  | 'open-settings'
  | 'undo'
  | 'redo'
  | 'show-whats-new'

/** Renderer-facing API surface, exposed on window.api via contextBridge. */
export interface RendererApi {
  buildings: {
    list(): Promise<Building[]>
    create(name: string): Promise<Building>
    rename(id: number, name: string): Promise<void>
    remove(id: number): Promise<void>
  }
  studios: {
    listByBuilding(buildingId: number): Promise<Studio[]>
    listCustom(): Promise<Studio[]>
    get(id: number): Promise<Studio | null>
    create(buildingId: number, name: string): Promise<Studio>
    createCustom(name: string, folderId: number | null): Promise<Studio>
    createTemporary(): Promise<Studio>
    updateCustomDetails(id: number, name: string, folderId: number | null): Promise<Studio>
    rename(id: number, name: string): Promise<void>
    remove(id: number): Promise<void>
    removeMany(ids: number[]): Promise<void>
    exportToFile(studioIds: number[]): Promise<ExportStudiosResult>
    pickImportFile(): Promise<PickImportFileResult>
    importStudios(studios: ExportedStudio[]): Promise<void>
    moveToFolder(id: number, folderId: number | null): Promise<void>
    reorder(ids: number[]): Promise<void>
    getDeleteImpact(id: number): Promise<StudioDeleteImpact>
  }
  mics: {
    listAvailableForStudio(
      studioId: number,
      setupId?: number | null,
      facultyReserveEnabledForSetup?: boolean
    ): Promise<Mic[]>
    listStudioMics(studioId: number): Promise<Mic[]>
    listBuildingPool(buildingId: number): Promise<Mic[]>
    listFacultyReserve(): Promise<Mic[]>
    listPersonalPool(): Promise<Mic[]>
    listSetupGear(setupId: number): Promise<Mic[]>
    listAll(): Promise<Mic[]>
    listAllWithStudio(): Promise<MicWithStudio[]>
    upsert(input: MicUpsertInput): Promise<Mic>
    remove(id: number): Promise<void>
  }
  outboard: {
    listByStudio(studioId: number): Promise<OutboardGear[]>
    listAvailableForStudio(
      studioId: number,
      setupId?: number | null,
      facultyReserveEnabledForSetup?: boolean
    ): Promise<OutboardGear[]>
    listBuildingPool(buildingId: number): Promise<OutboardGear[]>
    listFacultyReserve(): Promise<OutboardGear[]>
    listPersonalOutboard(): Promise<OutboardGear[]>
    listSetupGear(setupId: number): Promise<OutboardGear[]>
    listAll(): Promise<OutboardGear[]>
    listAllWithStudio(): Promise<OutboardGearWithStudio[]>
    upsert(input: OutboardUpsertInput): Promise<OutboardGear>
    remove(id: number): Promise<void>
  }
  preamps: {
    listByStudio(studioId: number): Promise<Preamp[]>
    listAvailableForStudio(
      studioId: number,
      setupId?: number | null,
      facultyReserveEnabledForSetup?: boolean
    ): Promise<Preamp[]>
    listBuildingPreamps(buildingId: number): Promise<Preamp[]>
    listFacultyReservePreamps(): Promise<Preamp[]>
    listPersonalPreamps(): Promise<Preamp[]>
    listSetupGear(setupId: number): Promise<Preamp[]>
    listAll(): Promise<Preamp[]>
    upsert(input: PreampUpsertInput): Promise<Preamp>
    remove(id: number): Promise<void>
  }
  layoutFile: {
    getForStudio(studioId: number): Promise<RoomLayoutFile | null>
    importForStudio(studioId: number): Promise<RoomLayoutFile | null>
    pickFile(): Promise<PickedLayoutFile | null>
    commitPickedToStudio(studioId: number, sourcePath: string): Promise<RoomLayoutFile>
    commitPickedToSetup(setupId: number, sourcePath: string): Promise<SetupLayoutOverride>
    setBlankForSetup(setupId: number): Promise<SetupLayoutOverride>
    getEffectiveForSetup(setupId: number | null, studioId: number): Promise<EffectiveLayout>
  }
  presets: {
    list(): Promise<ChannelPreset[]>
    getWithItems(id: number): Promise<ChannelPresetWithItems | null>
    create(input: ChannelPresetCreateInput): Promise<ChannelPreset>
    update(id: number, input: ChannelPresetCreateInput): Promise<ChannelPreset>
    remove(id: number): Promise<void>
    removeMany(ids: number[]): Promise<void>
    rename(id: number, name: string, description: string | null): Promise<ChannelPreset>
    moveToFolder(id: number, folderId: number | null): Promise<void>
    reorder(ids: number[]): Promise<void>
  }
  presetFolders: {
    list(): Promise<Folder[]>
    create(name: string, parentFolderId: number | null): Promise<Folder>
    rename(id: number, name: string): Promise<void>
    getDeleteImpact(id: number): Promise<FolderDeleteImpact>
    deleteRecursive(id: number): Promise<void>
    deletePromoteContents(id: number): Promise<void>
  }
  setups: {
    list(studioId?: number): Promise<Setup[]>
    listByKind(filter: SetupsListFilter): Promise<Setup[]>
    getWithItems(id: number): Promise<SetupWithItems | null>
    create(
      studioId: number,
      name: string,
      sessionDate: string | null,
      folderId: number | null,
      engineer: string | null,
      artist: string | null,
      facultyReserveEnabled: boolean,
      sessionNotes?: string | null
    ): Promise<Setup>
    rename(
      id: number,
      name: string,
      sessionDate: string | null,
      engineer: string | null,
      artist: string | null,
      facultyReserveEnabled: boolean,
      sessionNotes: string | null
    ): Promise<void>
    saveItems(setupId: number, items: SetupItemInput[]): Promise<SetupItem[]>
    setOutboardColumnCount(setupId: number, count: number): Promise<void>
    setVisibleColumns(setupId: number, columns: SetupColumnKey[]): Promise<void>
    setLastEditorMode(id: number, mode: EditorMode): Promise<void>
    remove(id: number): Promise<void>
    removeMany(ids: number[]): Promise<void>
    exportToFile(setupIds: number[]): Promise<ExportSetupsResult>
    pickImportFile(): Promise<PickSetupImportFileResult>
    importSetups(setups: ExportedSetup[], targetStudioId: number): Promise<void>
    instantiateFromTemplate(templateId: number): Promise<Setup>
    saveAsTemplate(input: SaveAsTemplateInput): Promise<Setup>
    duplicate(input: DuplicateSetupInput): Promise<Setup>
    moveToFolder(id: number, folderId: number | null): Promise<void>
    reorder(ids: number[]): Promise<void>
  }
  multiSetups: {
    listAll(): Promise<MultiSetup[]>
    getForSetup(setupId: number): Promise<MultiSetup | null>
    listMembers(multiSetupId: number): Promise<MultiSetupMember[]>
    createWithSetups(input: CreateMultiSetupInput): Promise<MultiSetup>
    addExisting(multiSetupId: number, setupId: number): Promise<void>
    createAndAdd(multiSetupId: number, name: string): Promise<Setup>
    rename(id: number, name: string): Promise<void>
    recordLastOpened(setupId: number): Promise<void>
    getDeleteImpact(id: number): Promise<{ setupCount: number }>
    moveToFolder(multiSetupId: number, folderId: number | null): Promise<void>
    removeManyCascade(ids: number[]): Promise<void>
    getComparison(multiSetupId: number): Promise<MultiSetupComparison | null>
    alignRow(input: AlignMultiSetupRowInput): Promise<{ updatedItemIds: number[] }>
    renameItemSource(itemId: number, sourceName: string): Promise<void>
    setItemMic(itemId: number, micId: number | null, micText: string | null, notes: string | null): Promise<void>
    linkItems(itemIds: number[], groupId: string): Promise<void>
    unlinkGroup(setupId: number, groupId: string): Promise<void>
  }
  settings: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
  }
  app: {
    getVersion(): Promise<string>
  }
  feedback: {
    submit(input: FeedbackSubmission): Promise<FeedbackSubmitResult>
  }
  berklee: {
    enable(): Promise<void>
    disable(): Promise<void>
    /** "Factory reset" for the Faculty Reserve mics editor — wipes and re-seeds faculty-reserve
     *  mics from the Berklee fixture. Outboard/preamps are untouched (no fixture data for them). */
    resetFacultyReserveMics(): Promise<void>
  }
  folders: {
    list(scope: FolderScope): Promise<Folder[]>
    create(name: string, parentFolderId: number | null, scope: FolderScope): Promise<Folder>
    rename(id: number, name: string): Promise<void>
    getDeleteImpact(id: number): Promise<FolderDeleteImpact>
    deleteRecursive(id: number): Promise<void>
    deletePromoteContents(id: number): Promise<void>
  }
  exportPdf: {
    exportSetup(input: ExportSetupPdfInput): Promise<ExportSetupPdfResult>
  }
  menu: {
    /** Subscribes to native File-menu actions. Returns an unsubscribe function. */
    onAction(callback: (action: MenuAction) => void): () => void
  }
  roomLayoutBlocks: {
    listBySetup(setupId: number): Promise<RoomLayoutBlock[]>
    saveForSetup(setupId: number, blocks: RoomLayoutBlockInput[]): Promise<RoomLayoutBlock[]>
  }
  palette: {
    listVisible(): Promise<PaletteItem[]>
    listAll(): Promise<PaletteItem[]>
    createCustom(input: PaletteItemCreateInput): Promise<PaletteItem>
    update(id: number, patch: PaletteItemUpdateInput): Promise<PaletteItem>
    removeCustom(id: number): Promise<void>
    reorder(ids: number[]): Promise<void>
    /** Rewrites the category on every item currently in `oldName` (renaming onto an existing
     *  category name merges the two groups). */
    renameCategory(oldName: string, newName: string): Promise<void>
    /** Removes a whole category: hard-deletes its custom items, soft-hides its built-in items
     *  (recoverable from the editor's Hidden list). */
    deleteCategory(category: string): Promise<void>
  }
}
