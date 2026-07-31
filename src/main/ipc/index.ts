import { registerStudioHandlers } from './studioHandlers'
import { registerCatalogHandlers } from './catalogHandlers'
import { registerChannelPresetHandlers } from './channelPresetHandlers'
import { registerSetupHandlers } from './setupHandlers'
import { registerLayoutFileHandlers } from './layoutFileHandlers'
import { registerExportHandlers } from './exportHandlers'
import { registerFolderHandlers } from './folderHandlers'
import { registerPresetFolderHandlers } from './presetFolderHandlers'
import { registerRoomLayoutBlockHandlers } from './roomLayoutBlockHandlers'
import { registerPaletteHandlers } from './paletteHandlers'
import { registerBerkleeHandlers } from './berkleeHandlers'
import { registerAppHandlers } from './appHandlers'
import { registerFeedbackHandlers } from './feedbackHandlers'
import { registerLayoutWindowHandlers } from '../layoutWindow'

export function registerAllIpcHandlers(): void {
  registerStudioHandlers()
  registerCatalogHandlers()
  registerChannelPresetHandlers()
  registerSetupHandlers()
  registerLayoutFileHandlers()
  registerExportHandlers()
  registerFolderHandlers()
  registerPresetFolderHandlers()
  registerRoomLayoutBlockHandlers()
  registerPaletteHandlers()
  registerBerkleeHandlers()
  registerAppHandlers()
  registerFeedbackHandlers()
  registerLayoutWindowHandlers()
}
