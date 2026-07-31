import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  MENU_CHANNEL,
  LAYOUT_WINDOW_STATE_CHANNEL,
  LAYOUT_WINDOW_EXPORT_REQUEST_CHANNEL,
  LAYOUT_WINDOW_EXPORT_RESULT_CHANNEL,
  LAYOUT_WINDOW_FLUSH_REQUEST_CHANNEL,
  LAYOUT_WINDOW_FLUSH_ACK_CHANNEL,
  type MenuAction,
  type LayoutWindowState,
  type LayoutWindowExportRequest,
  type LayoutWindowExportResult,
  type LayoutWindowFlushRequest,
  type LayoutWindowFlushAck,
  type RendererApi
} from '@shared/types/ipc'

const api: RendererApi = {
  buildings: {
    list: () => ipcRenderer.invoke(IPC.buildings.list),
    create: (name) => ipcRenderer.invoke(IPC.buildings.create, name),
    rename: (id, name) => ipcRenderer.invoke(IPC.buildings.rename, id, name),
    remove: (id) => ipcRenderer.invoke(IPC.buildings.remove, id)
  },
  studios: {
    listByBuilding: (buildingId) => ipcRenderer.invoke(IPC.studios.listByBuilding, buildingId),
    listCustom: () => ipcRenderer.invoke(IPC.studios.listCustom),
    get: (id) => ipcRenderer.invoke(IPC.studios.get, id),
    create: (buildingId, name) => ipcRenderer.invoke(IPC.studios.create, buildingId, name),
    createCustom: (name, folderId) => ipcRenderer.invoke(IPC.studios.createCustom, name, folderId),
    createTemporary: () => ipcRenderer.invoke(IPC.studios.createTemporary),
    updateCustomDetails: (id, name, folderId) =>
      ipcRenderer.invoke(IPC.studios.updateCustomDetails, id, name, folderId),
    rename: (id, name) => ipcRenderer.invoke(IPC.studios.rename, id, name),
    remove: (id) => ipcRenderer.invoke(IPC.studios.remove, id),
    removeMany: (ids) => ipcRenderer.invoke(IPC.studios.removeMany, ids),
    exportToFile: (studioIds) => ipcRenderer.invoke(IPC.studios.exportToFile, studioIds),
    pickImportFile: () => ipcRenderer.invoke(IPC.studios.pickImportFile),
    importStudios: (studios) => ipcRenderer.invoke(IPC.studios.importStudios, studios),
    moveToFolder: (id, folderId) => ipcRenderer.invoke(IPC.studios.moveToFolder, id, folderId),
    moveManyToFolder: (ids, folderId) => ipcRenderer.invoke(IPC.studios.moveManyToFolder, ids, folderId),
    reorder: (ids) => ipcRenderer.invoke(IPC.studios.reorder, ids),
    getDeleteImpact: (id) => ipcRenderer.invoke(IPC.studios.getDeleteImpact, id)
  },
  mics: {
    listAvailableForStudio: (studioId, setupId, facultyReserveEnabledForSetup) =>
      ipcRenderer.invoke(IPC.mics.listAvailableForStudio, studioId, setupId, facultyReserveEnabledForSetup),
    listStudioMics: (studioId) => ipcRenderer.invoke(IPC.mics.listStudioMics, studioId),
    listBuildingPool: (buildingId) => ipcRenderer.invoke(IPC.mics.listBuildingPool, buildingId),
    listFacultyReserve: () => ipcRenderer.invoke(IPC.mics.listFacultyReserve),
    listPersonalPool: () => ipcRenderer.invoke(IPC.mics.listPersonalPool),
    listSetupGear: (setupId) => ipcRenderer.invoke(IPC.mics.listSetupGear, setupId),
    listAll: () => ipcRenderer.invoke(IPC.mics.listAll),
    listAllWithStudio: () => ipcRenderer.invoke(IPC.mics.listAllWithStudio),
    upsert: (input) => ipcRenderer.invoke(IPC.mics.upsert, input),
    remove: (id) => ipcRenderer.invoke(IPC.mics.remove, id)
  },
  outboard: {
    listByStudio: (studioId) => ipcRenderer.invoke(IPC.outboard.listByStudio, studioId),
    listAvailableForStudio: (studioId, setupId, facultyReserveEnabledForSetup) =>
      ipcRenderer.invoke(IPC.outboard.listAvailableForStudio, studioId, setupId, facultyReserveEnabledForSetup),
    listBuildingPool: (buildingId) => ipcRenderer.invoke(IPC.outboard.listBuildingPool, buildingId),
    listFacultyReserve: () => ipcRenderer.invoke(IPC.outboard.listFacultyReserve),
    listPersonalOutboard: () => ipcRenderer.invoke(IPC.outboard.listPersonalOutboard),
    listSetupGear: (setupId) => ipcRenderer.invoke(IPC.outboard.listSetupGear, setupId),
    listAll: () => ipcRenderer.invoke(IPC.outboard.listAll),
    listAllWithStudio: () => ipcRenderer.invoke(IPC.outboard.listAllWithStudio),
    upsert: (input) => ipcRenderer.invoke(IPC.outboard.upsert, input),
    remove: (id) => ipcRenderer.invoke(IPC.outboard.remove, id)
  },
  preamps: {
    listByStudio: (studioId) => ipcRenderer.invoke(IPC.preamps.listByStudio, studioId),
    listAvailableForStudio: (studioId, setupId, facultyReserveEnabledForSetup) =>
      ipcRenderer.invoke(IPC.preamps.listAvailableForStudio, studioId, setupId, facultyReserveEnabledForSetup),
    listBuildingPreamps: (buildingId) => ipcRenderer.invoke(IPC.preamps.listBuildingPreamps, buildingId),
    listFacultyReservePreamps: () => ipcRenderer.invoke(IPC.preamps.listFacultyReservePreamps),
    listPersonalPreamps: () => ipcRenderer.invoke(IPC.preamps.listPersonalPreamps),
    listSetupGear: (setupId) => ipcRenderer.invoke(IPC.preamps.listSetupGear, setupId),
    listAll: () => ipcRenderer.invoke(IPC.preamps.listAll),
    upsert: (input) => ipcRenderer.invoke(IPC.preamps.upsert, input),
    remove: (id) => ipcRenderer.invoke(IPC.preamps.remove, id)
  },
  layoutFile: {
    getForStudio: (studioId) => ipcRenderer.invoke(IPC.layoutFile.getForStudio, studioId),
    importForStudio: (studioId) => ipcRenderer.invoke(IPC.layoutFile.importForStudio, studioId),
    pickFile: () => ipcRenderer.invoke(IPC.layoutFile.pickFile),
    commitPickedToStudio: (studioId, sourcePath) =>
      ipcRenderer.invoke(IPC.layoutFile.commitPickedToStudio, studioId, sourcePath),
    commitPickedToSetup: (setupId, sourcePath) =>
      ipcRenderer.invoke(IPC.layoutFile.commitPickedToSetup, setupId, sourcePath),
    setBlankForSetup: (setupId) => ipcRenderer.invoke(IPC.layoutFile.setBlankForSetup, setupId),
    getEffectiveForSetup: (setupId, studioId) =>
      ipcRenderer.invoke(IPC.layoutFile.getEffectiveForSetup, setupId, studioId)
  },
  presets: {
    list: () => ipcRenderer.invoke(IPC.presets.list),
    getWithItems: (id) => ipcRenderer.invoke(IPC.presets.getWithItems, id),
    create: (input) => ipcRenderer.invoke(IPC.presets.create, input),
    update: (id, input) => ipcRenderer.invoke(IPC.presets.update, id, input),
    remove: (id) => ipcRenderer.invoke(IPC.presets.remove, id),
    removeMany: (ids) => ipcRenderer.invoke(IPC.presets.removeMany, ids),
    rename: (id, name, description) => ipcRenderer.invoke(IPC.presets.rename, id, name, description),
    moveToFolder: (id, folderId) => ipcRenderer.invoke(IPC.presets.moveToFolder, id, folderId),
    reorder: (ids) => ipcRenderer.invoke(IPC.presets.reorder, ids)
  },
  presetFolders: {
    list: () => ipcRenderer.invoke(IPC.presetFolders.list),
    create: (name, parentFolderId) => ipcRenderer.invoke(IPC.presetFolders.create, name, parentFolderId),
    rename: (id, name) => ipcRenderer.invoke(IPC.presetFolders.rename, id, name),
    getDeleteImpact: (id) => ipcRenderer.invoke(IPC.presetFolders.getDeleteImpact, id),
    deleteRecursive: (id) => ipcRenderer.invoke(IPC.presetFolders.deleteRecursive, id),
    deletePromoteContents: (id) => ipcRenderer.invoke(IPC.presetFolders.deletePromoteContents, id)
  },
  setups: {
    list: (studioId) => ipcRenderer.invoke(IPC.setups.list, studioId),
    listByKind: (filter) => ipcRenderer.invoke(IPC.setups.listByKind, filter),
    getWithItems: (id) => ipcRenderer.invoke(IPC.setups.getWithItems, id),
    create: (studioId, name, sessionDate, folderId, engineer, artist, facultyReserveEnabled, sessionNotes) =>
      ipcRenderer.invoke(
        IPC.setups.create,
        studioId,
        name,
        sessionDate,
        folderId,
        engineer,
        artist,
        facultyReserveEnabled,
        sessionNotes
      ),
    rename: (id, name, sessionDate, engineer, artist, facultyReserveEnabled, sessionNotes) =>
      ipcRenderer.invoke(
        IPC.setups.rename,
        id,
        name,
        sessionDate,
        engineer,
        artist,
        facultyReserveEnabled,
        sessionNotes
      ),
    saveItems: (setupId, items) => ipcRenderer.invoke(IPC.setups.saveItems, setupId, items),
    setOutboardColumnCount: (setupId, count) =>
      ipcRenderer.invoke(IPC.setups.setOutboardColumnCount, setupId, count),
    setVisibleColumns: (setupId, columns) => ipcRenderer.invoke(IPC.setups.setVisibleColumns, setupId, columns),
    setLastEditorMode: (id, mode) => ipcRenderer.invoke(IPC.setups.setLastEditorMode, id, mode),
    remove: (id) => ipcRenderer.invoke(IPC.setups.remove, id),
    removeMany: (ids) => ipcRenderer.invoke(IPC.setups.removeMany, ids),
    exportToFile: (setupIds) => ipcRenderer.invoke(IPC.setups.exportToFile, setupIds),
    pickImportFile: () => ipcRenderer.invoke(IPC.setups.pickImportFile),
    importSetups: (setups, targetStudioId) => ipcRenderer.invoke(IPC.setups.importSetups, setups, targetStudioId),
    instantiateFromTemplate: (templateId) => ipcRenderer.invoke(IPC.setups.instantiateFromTemplate, templateId),
    saveAsTemplate: (input) => ipcRenderer.invoke(IPC.setups.saveAsTemplate, input),
    duplicate: (input) => ipcRenderer.invoke(IPC.setups.duplicate, input),
    moveToFolder: (id, folderId) => ipcRenderer.invoke(IPC.setups.moveToFolder, id, folderId),
    moveManyToFolder: (ids, folderId) => ipcRenderer.invoke(IPC.setups.moveManyToFolder, ids, folderId),
    reorder: (ids) => ipcRenderer.invoke(IPC.setups.reorder, ids)
  },
  settings: {
    get: (key) => ipcRenderer.invoke(IPC.settings.get, key),
    set: (key, value) => ipcRenderer.invoke(IPC.settings.set, key, value)
  },
  app: {
    getVersion: () => ipcRenderer.invoke(IPC.app.getVersion)
  },
  feedback: {
    submit: (input) => ipcRenderer.invoke(IPC.feedback.submit, input)
  },
  berklee: {
    enable: () => ipcRenderer.invoke(IPC.berklee.enable),
    disable: () => ipcRenderer.invoke(IPC.berklee.disable),
    resetFacultyReserveMics: () => ipcRenderer.invoke(IPC.berklee.resetFacultyReserveMics)
  },
  folders: {
    list: (scope) => ipcRenderer.invoke(IPC.folders.list, scope),
    create: (name, parentFolderId, scope) =>
      ipcRenderer.invoke(IPC.folders.create, name, parentFolderId, scope),
    rename: (id, name) => ipcRenderer.invoke(IPC.folders.rename, id, name),
    getDeleteImpact: (id) => ipcRenderer.invoke(IPC.folders.getDeleteImpact, id),
    deleteRecursive: (id) => ipcRenderer.invoke(IPC.folders.deleteRecursive, id),
    deletePromoteContents: (id) => ipcRenderer.invoke(IPC.folders.deletePromoteContents, id)
  },
  exportPdf: {
    exportSetup: (input) => ipcRenderer.invoke(IPC.exportPdf.exportSetup, input)
  },
  menu: {
    onAction: (callback) => {
      const listener = (_event: unknown, action: MenuAction): void => callback(action)
      ipcRenderer.on(MENU_CHANNEL, listener)
      return () => ipcRenderer.removeListener(MENU_CHANNEL, listener)
    }
  },
  roomLayoutBlocks: {
    listBySetup: (setupId) => ipcRenderer.invoke(IPC.roomLayoutBlocks.listBySetup, setupId),
    saveForSetup: (setupId, blocks) => ipcRenderer.invoke(IPC.roomLayoutBlocks.saveForSetup, setupId, blocks)
  },
  layoutWindow: {
    open: (setupId, studioId) => ipcRenderer.invoke(IPC.layoutWindow.open, setupId, studioId),
    focus: () => ipcRenderer.invoke(IPC.layoutWindow.focus),
    getState: () => ipcRenderer.invoke(IPC.layoutWindow.getState),
    requestExportImage: (setupId, pixelRatio, monochrome) =>
      ipcRenderer.invoke(IPC.layoutWindow.requestExportImage, setupId, pixelRatio, monochrome),
    onStateChanged: (callback) => {
      const listener = (_event: unknown, state: LayoutWindowState): void => callback(state)
      ipcRenderer.on(LAYOUT_WINDOW_STATE_CHANNEL, listener)
      return () => ipcRenderer.removeListener(LAYOUT_WINDOW_STATE_CHANNEL, listener)
    },
    onExportImageRequested: (callback) => {
      const listener = (_event: unknown, request: LayoutWindowExportRequest): void => callback(request)
      ipcRenderer.on(LAYOUT_WINDOW_EXPORT_REQUEST_CHANNEL, listener)
      return () => ipcRenderer.removeListener(LAYOUT_WINDOW_EXPORT_REQUEST_CHANNEL, listener)
    },
    onFlushRequested: (callback) => {
      const listener = (_event: unknown, request: LayoutWindowFlushRequest): void => callback(request)
      ipcRenderer.on(LAYOUT_WINDOW_FLUSH_REQUEST_CHANNEL, listener)
      return () => ipcRenderer.removeListener(LAYOUT_WINDOW_FLUSH_REQUEST_CHANNEL, listener)
    },
    sendExportImageResult: (result: LayoutWindowExportResult) =>
      ipcRenderer.send(LAYOUT_WINDOW_EXPORT_RESULT_CHANNEL, result),
    sendFlushAck: (ack: LayoutWindowFlushAck) => ipcRenderer.send(LAYOUT_WINDOW_FLUSH_ACK_CHANNEL, ack)
  },
  palette: {
    listVisible: () => ipcRenderer.invoke(IPC.palette.listVisible),
    listAll: () => ipcRenderer.invoke(IPC.palette.listAll),
    createCustom: (input) => ipcRenderer.invoke(IPC.palette.createCustom, input),
    update: (id, patch) => ipcRenderer.invoke(IPC.palette.update, id, patch),
    removeCustom: (id) => ipcRenderer.invoke(IPC.palette.removeCustom, id),
    reorder: (ids) => ipcRenderer.invoke(IPC.palette.reorder, ids),
    renameCategory: (oldName, newName) => ipcRenderer.invoke(IPC.palette.renameCategory, oldName, newName),
    deleteCategory: (category) => ipcRenderer.invoke(IPC.palette.deleteCategory, category)
  }
}

contextBridge.exposeInMainWorld('api', api)
