import { ipcMain } from 'electron'
import { IPC } from '@shared/types/ipc'
import { fetchStudioLibraryIndex, fetchStudioLibraryPacks } from '../studios/studioLibrary'

/** The renderer's CSP is `connect-src 'self'`, so it cannot reach the companion site itself. These
 *  two handlers are the only way the app talks to the studio library, the same arrangement
 *  feedbackHandlers uses for Formspree. Both resolve a result object and never reject. */
export function registerStudioLibraryHandlers(): void {
  ipcMain.handle(IPC.studioLibrary.fetchIndex, () => fetchStudioLibraryIndex())
  ipcMain.handle(IPC.studioLibrary.fetchPacks, (_e, files: string[]) => fetchStudioLibraryPacks(files))
}
