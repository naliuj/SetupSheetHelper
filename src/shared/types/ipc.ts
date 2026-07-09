import type {
  Building,
  Mic,
  MicPoolType,
  MicWithStudio,
  OutboardGear,
  OutboardGearWithStudio,
  OutboardPoolType,
  Preamp,
  PreampPoolType,
  RoomLayoutFile,
  Studio
} from './entities'
import type { ChannelPreset, ChannelPresetItemInput, ChannelPresetWithItems } from './channelPreset'
import type { Folder, RoomLayoutBlock, Setup, SetupItem, SetupKind, SetupWithItems, TemplateSource } from './setup'

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
    listSetupGear: 'preamps:listSetupGear',
    listAll: 'preamps:listAll',
    upsert: 'preamps:upsert',
    remove: 'preamps:remove'
  },
  layoutFile: {
    getForStudio: 'layoutFile:getForStudio',
    importForStudio: 'layoutFile:importForStudio'
  },
  presets: {
    list: 'presets:list',
    getWithItems: 'presets:getWithItems',
    create: 'presets:create',
    update: 'presets:update',
    remove: 'presets:remove'
  },
  setups: {
    list: 'setups:list',
    listByKind: 'setups:listByKind',
    getWithItems: 'setups:getWithItems',
    create: 'setups:create',
    rename: 'setups:rename',
    saveItems: 'setups:saveItems',
    remove: 'setups:remove',
    instantiateFromTemplate: 'setups:instantiateFromTemplate',
    saveAsTemplate: 'setups:saveAsTemplate',
    moveToFolder: 'setups:moveToFolder',
    reorder: 'setups:reorder'
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set'
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
  setupId: number | null
  name: string
  manufacturer: string | null
  category: string | null
  notes: string | null
  channels?: number
  sortOrder?: number
}

export interface SetupItemInput {
  id: number | string
  instrumentType: string
  sourceName: string
  micId: number | null
  micText: string | null
  channel: number | null
  tieLine: number | null
  cueBox: number | null
  outboardId: number | null
  outboardText: string | null
  preampId: number | null
  preampText: string | null
  polarityFlip: boolean
  notes: string | null
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

export interface ExportedStudio {
  name: string
  hasConsole: boolean
  mics: ExportedStudioGear[]
  outboardGear: ExportedStudioGear[]
  preamps: ExportedPreamp[]
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

export interface ChannelPresetCreateInput {
  name: string
  description: string | null
  items: ChannelPresetItemInput[]
}

export type PdfExportInclude = 'sheet' | 'layout' | 'both'

export interface ExportSetupPdfInput {
  setupId: number
  layoutImageDataUrl: string | null
  include: PdfExportInclude
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

export interface FolderDeleteImpact {
  folderCount: number
  studioCount: number
  setupCount: number
}

export interface StudioDeleteImpact {
  setupCount: number
  templateCount: number
}

export const MENU_CHANNEL = 'menu:action'

export type MenuAction =
  | 'save-as-studio'
  | 'save-setup'
  | 'export-pdf'
  | 'toggle-mode'
  | 'add-source'
  | 'select-all'
  | 'delete-row'
  | 'sequential-numbering'
  | 'open-setup-settings'
  | 'undo'
  | 'redo'

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
    createCustom(name: string, folderId: number | null, hasConsole: boolean): Promise<Studio>
    createTemporary(): Promise<Studio>
    updateCustomDetails(id: number, name: string, folderId: number | null, hasConsole: boolean): Promise<Studio>
    rename(id: number, name: string): Promise<void>
    remove(id: number): Promise<void>
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
    listAvailableForStudio(studioId: number, setupId?: number | null): Promise<Preamp[]>
    listSetupGear(setupId: number): Promise<Preamp[]>
    listAll(): Promise<Preamp[]>
    upsert(input: PreampUpsertInput): Promise<Preamp>
    remove(id: number): Promise<void>
  }
  layoutFile: {
    getForStudio(studioId: number): Promise<RoomLayoutFile | null>
    importForStudio(studioId: number): Promise<RoomLayoutFile | null>
  }
  presets: {
    list(): Promise<ChannelPreset[]>
    getWithItems(id: number): Promise<ChannelPresetWithItems | null>
    create(input: ChannelPresetCreateInput): Promise<ChannelPreset>
    update(id: number, input: ChannelPresetCreateInput): Promise<ChannelPreset>
    remove(id: number): Promise<void>
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
      facultyReserveEnabled: boolean
    ): Promise<Setup>
    rename(
      id: number,
      name: string,
      sessionDate: string | null,
      engineer: string | null,
      artist: string | null,
      facultyReserveEnabled: boolean
    ): Promise<void>
    saveItems(setupId: number, items: SetupItemInput[]): Promise<SetupItem[]>
    remove(id: number): Promise<void>
    instantiateFromTemplate(templateId: number): Promise<Setup>
    saveAsTemplate(input: SaveAsTemplateInput): Promise<Setup>
    moveToFolder(id: number, folderId: number | null): Promise<void>
    reorder(ids: number[]): Promise<void>
  }
  settings: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
  }
  folders: {
    list(): Promise<Folder[]>
    create(name: string, parentFolderId: number | null): Promise<Folder>
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
}
