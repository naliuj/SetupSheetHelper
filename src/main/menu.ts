import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { MENU_CHANNEL, type MenuAction } from '@shared/types/ipc'
import { checkForUpdatesManually } from './autoUpdater'

/** Builds the native application menu, wiring File-menu items through to the renderer via IPC. */
export function installAppMenu(mainWindow: BrowserWindow): void {
  const isMac = process.platform === 'darwin'

  function send(action: MenuAction): void {
    mainWindow.webContents.send(MENU_CHANNEL, action)
  }

  // Reproduces Electron's default `role: 'appMenu'` template exactly, plus a "Check for
  // Updates…" item in the conventional spot (right below About, above Services/Quit).
  const appMenu: MenuItemConstructorOptions = {
    label: 'Setup Sheet Helper',
    submenu: [
      { role: 'about' },
      { label: 'Check for Updates…', click: () => checkForUpdatesManually(mainWindow) },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Save Setup', accelerator: 'CmdOrCtrl+S', click: () => send('save-setup') },
        { label: 'Save as Studio…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as-studio') },
        { type: 'separator' },
        { label: 'Export PDF…', accelerator: 'CmdOrCtrl+E', click: () => send('export-pdf') },
        { type: 'separator' },
        { label: 'Toggle Layout/Table Mode', accelerator: 'CmdOrCtrl+L', click: () => send('toggle-mode') },
        ...(isMac ? [] : [{ type: 'separator' } as const, { role: 'quit' } as const])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('redo') },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => send('select-all') },
        { label: 'Add Source', accelerator: 'CmdOrCtrl+N', click: () => send('add-source') },
        { label: 'Delete Selection', accelerator: 'CmdOrCtrl+Backspace', click: () => send('delete-selection') },
        { label: 'Duplicate', accelerator: 'CmdOrCtrl+D', click: () => send('duplicate-selection') },
        { label: 'Number Selected Rows…', accelerator: 'CmdOrCtrl+Shift+N', click: () => send('sequential-numbering') },
        { type: 'separator' },
        // Shift-modified so these don't collide with the built-in viewMenu role's page-zoom
        // accelerators (CmdOrCtrl+Plus/Minus/0) — those zoom the whole window's rendering
        // (an accessibility feature), not the Layout Mode canvas.
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Shift+=', click: () => send('zoom-in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+Shift+-', click: () => send('zoom-out') },
        { label: 'Reset View', accelerator: 'CmdOrCtrl+Shift+0', click: () => send('reset-view') },
        { type: 'separator' },
        { label: 'Setup Settings…', accelerator: 'CmdOrCtrl+G', click: () => send('open-setup-settings') }
      ]
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
