import { registerStudioHandlers } from './studioHandlers'
import { registerCatalogHandlers } from './catalogHandlers'
import { registerChannelPresetHandlers } from './channelPresetHandlers'
import { registerSetupHandlers } from './setupHandlers'
import { registerLayoutFileHandlers } from './layoutFileHandlers'
import { registerExportHandlers } from './exportHandlers'
import { registerFolderHandlers } from './folderHandlers'
import { registerRoomLayoutBlockHandlers } from './roomLayoutBlockHandlers'
import { registerPaletteHandlers } from './paletteHandlers'

export function registerAllIpcHandlers(): void {
  registerStudioHandlers()
  registerCatalogHandlers()
  registerChannelPresetHandlers()
  registerSetupHandlers()
  registerLayoutFileHandlers()
  registerExportHandlers()
  registerFolderHandlers()
  registerRoomLayoutBlockHandlers()
  registerPaletteHandlers()
}
