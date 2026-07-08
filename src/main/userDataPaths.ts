import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

export function getUserDataDir(): string {
  return app.getPath('userData')
}

export function getDbPath(): string {
  return join(getUserDataDir(), 'setup-sheet-helper.sqlite')
}

export function getLayoutsDir(): string {
  const dir = join(getUserDataDir(), 'layouts')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Read-only source directory for the room-layout PDFs bundled with the app (seeded into a
 *  fresh install's userData/layouts on first launch) — packaged apps ship them under
 *  Resources/layouts via electron-builder's extraResources; in dev, resources/layouts sits at
 *  the project root. */
export function getBundledLayoutsDir(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'layouts')
  return join(app.getAppPath(), 'resources', 'layouts')
}
