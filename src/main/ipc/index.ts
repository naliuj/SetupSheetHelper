import { registerStudioHandlers } from './studioHandlers'
import { registerCatalogHandlers } from './catalogHandlers'
import { registerChannelPresetHandlers } from './channelPresetHandlers'
import { registerSetupHandlers } from './setupHandlers'
import { registerMultiSetupHandlers } from './multiSetupHandlers'
import { registerLayoutFileHandlers } from './layoutFileHandlers'
import { registerExportHandlers } from './exportHandlers'
import { registerFolderHandlers } from './folderHandlers'
import { registerPresetFolderHandlers } from './presetFolderHandlers'
import { registerRoomLayoutBlockHandlers } from './roomLayoutBlockHandlers'
import { registerPaletteHandlers } from './paletteHandlers'
import { registerBerkleeHandlers } from './berkleeHandlers'
import { registerAppHandlers } from './appHandlers'
import { registerFeedbackHandlers } from './feedbackHandlers'

export function registerAllIpcHandlers(): void {
  registerStudioHandlers()
  registerCatalogHandlers()
  registerChannelPresetHandlers()
  registerSetupHandlers()
  registerMultiSetupHandlers()
  registerLayoutFileHandlers()
  registerExportHandlers()
  registerFolderHandlers()
  registerPresetFolderHandlers()
  registerRoomLayoutBlockHandlers()
  registerPaletteHandlers()
  registerBerkleeHandlers()
  registerAppHandlers()
  registerFeedbackHandlers()
}
