import { registerStudioHandlers } from './studioHandlers'
import { registerCatalogHandlers } from './catalogHandlers'
import { registerChannelPresetHandlers } from './channelPresetHandlers'
import { registerSetupHandlers } from './setupHandlers'
import { registerPdfHandlers } from './pdfHandlers'
import { registerExportHandlers } from './exportHandlers'
import { registerFolderHandlers } from './folderHandlers'
import { registerRoomLayoutBlockHandlers } from './roomLayoutBlockHandlers'

export function registerAllIpcHandlers(): void {
  registerStudioHandlers()
  registerCatalogHandlers()
  registerChannelPresetHandlers()
  registerSetupHandlers()
  registerPdfHandlers()
  registerExportHandlers()
  registerFolderHandlers()
  registerRoomLayoutBlockHandlers()
}
