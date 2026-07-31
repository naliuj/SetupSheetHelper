import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { MENU_CHANNEL, type MenuAction } from '@shared/types/ipc'
import { checkForUpdatesManually } from './autoUpdater'

/** Builds the native application menu, wiring File-menu items through to the renderer via IPC.
 *  Deliberately carries no `accelerator` on almost any app-defined item (Settings/Save/Export/
 *  Undo/Delete/etc.) — those are all now user-rebindable via Settings → Keybinds, dispatched by a
 *  single DOM keydown listener in the renderer (SetupToolbar.tsx + App.tsx for open-settings)
 *  instead of native Electron accelerators. Native accelerators fire before the DOM even sees the
 *  keystroke, which can't be made to respect focused text fields (that's exactly why bare
 *  Delete/Backspace already lived in a DOM listener) and can't be changed at runtime without
 *  rebuilding this menu. The menu items themselves stay (label + click) for mouse/trackpad users
 *  and macOS convention — only the live keyboard binding moved. Native OS roles (cut/copy/paste/
 *  quit/hide/services/about) and the built-in viewMenu/windowMenu are untouched; they're not
 *  app-defined actions and aren't part of the rebindable set.
 *  "Select All" is the one exception and DOES carry a real `accelerator` — like cut/copy/paste,
 *  the OS only routes Cmd/Ctrl+A into a focused text field via an actual menu accelerator, so
 *  without one it's not a "text field loses default behavior" case, it's "nothing happens at all,
 *  anywhere in the app". See App.tsx/SetupToolbar.tsx's handleSelectAll for the renderer side. */
export function installAppMenu(updateDialogParent: BrowserWindow): void {
  const isMac = process.platform === 'darwin'

  // Targets whichever window is actually focused, not a window captured at menu-build time —
  // with a second (Layout Mode) window now possible, a menu click or its matching keyboard
  // shortcut has to act on whatever the user is looking at. A window with no handler for a given
  // action (e.g. "Save Setup" while the Layout window is focused) just no-ops silently; there's no
  // per-window menu-item enabling here, only per-window action dispatch on the renderer side.
  function send(action: MenuAction): void {
    BrowserWindow.getFocusedWindow()?.webContents.send(MENU_CHANNEL, action)
  }

  // Reproduces Electron's default `role: 'appMenu'` template exactly, plus a "Check for
  // Updates…" item in the conventional spot (right below About, above Services/Quit).
  const appMenu: MenuItemConstructorOptions = {
    label: 'Setup Sheet Helper',
    submenu: [
      { role: 'about' },
      { label: 'Check for Updates…', click: () => checkForUpdatesManually(updateDialogParent) },
      { label: "What's New…", click: () => send('show-whats-new') },
      { type: 'separator' },
      { label: 'Settings…', click: () => send('open-settings') },
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
        { label: 'Save Setup', click: () => send('save-setup') },
        { label: 'Save as Studio…', click: () => send('save-as-studio') },
        { type: 'separator' },
        { label: 'Export PDF…', click: () => send('export-pdf') },
        { type: 'separator' },
        { label: 'Toggle Layout/Table Mode', click: () => send('toggle-mode') },
        ...(isMac ? [] : [{ type: 'separator' } as const, { role: 'quit' } as const])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', click: () => send('undo') },
        { label: 'Redo', click: () => send('redo') },
        { type: 'separator' },
        // Standard clipboard roles. On macOS the OS routes Cmd+C/X/V through the app menu, so
        // without these items the shortcuts never reach a focused text input (e.g. the Notes
        // field) and copy/paste appears broken. The roles let Electron handle them natively.
        // Unlike the app-defined actions above, these are NOT part of the rebindable set.
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => send('select-all') },
        { label: 'Add Source', click: () => send('add-source') },
        { label: 'Delete Selection', click: () => send('delete-selection') },
        { label: 'Duplicate', click: () => send('duplicate-selection') },
        { label: 'Number Selected Rows…', click: () => send('sequential-numbering') },
        { type: 'separator' },
        { label: 'Zoom In', click: () => send('zoom-in') },
        { label: 'Zoom Out', click: () => send('zoom-out') },
        { label: 'Reset View', click: () => send('reset-view') },
        { type: 'separator' },
        { label: 'Setup Settings…', click: () => send('open-setup-settings') },
        // On mac, app-wide Settings lives in the app menu; on Windows/Linux there's no app menu,
        // so surface it here alongside the setup-specific settings.
        ...(isMac ? [] : [{ label: 'Settings…', click: () => send('open-settings') } as const])
      ]
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
