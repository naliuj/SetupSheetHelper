import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { MENU_CHANNEL, type MenuAction } from '@shared/types/ipc'

/** Builds the native application menu, wiring File-menu items through to the renderer via IPC. */
export function installAppMenu(mainWindow: BrowserWindow): void {
  const isMac = process.platform === 'darwin'

  function send(action: MenuAction): void {
    mainWindow.webContents.send(MENU_CHANNEL, action)
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as const] : []),
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
        { label: 'Add Source', accelerator: 'CmdOrCtrl+N', click: () => send('add-source') },
        { label: 'Delete Selected Rows', accelerator: 'CmdOrCtrl+Backspace', click: () => send('delete-row') },
        { label: 'Sequential Numbering…', accelerator: 'CmdOrCtrl+Shift+N', click: () => send('sequential-numbering') },
        { type: 'separator' },
        { label: 'Setup Settings…', accelerator: 'CmdOrCtrl+G', click: () => send('open-setup-settings') }
      ]
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
