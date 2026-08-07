// The registry of every user-rebindable app shortcut, plus the small amount of pure logic
// (combo normalization/formatting, conflict detection) shared between the renderer's keydown
// dispatcher (SetupToolbar.tsx) and the Settings > Keybinds editor.

export type KeybindScope = 'global' | 'table' | 'layout'

export interface KeybindActionDef {
  id: string
  label: string
  category: string
  scope: KeybindScope
  defaultCombo: string
  /** True only for actions whose natural key is a bare, unmodified key (Escape/Delete/
   *  Backspace) — these are safe because their dispatcher already checks isTextField before
   *  acting. Every other action requires at least one modifier in a custom binding, so a user
   *  recording a shortcut can't accidentally turn a plain letter into a global hotkey that
   *  swallows normal typing. */
  allowBareKey?: boolean
}

// Mirrors the existing MenuActions/DOM listeners 1:1, with one deliberate split: the app has
// THREE independent "delete the selection" code paths today (Cmd/Ctrl+Backspace, routed through
// one MenuAction that branches on mode; and two separate bare-Delete listeners, one in Table
// Mode's toolbar and one in Layout Mode's canvas). The Cmd/Ctrl+Backspace path stays a single
// `global`-scope entry (matching how duplicate-selection and clear-selection already work — one
// binding, mode-branching internally). The two bare-Delete listeners are genuinely separate code
// today, so they become two separate entries with disjoint scopes — the concrete case the
// conflict checker must correctly NOT warn about, since only one mode is ever visible at once.
export const KEYBIND_ACTIONS: KeybindActionDef[] = [
  { id: 'open-settings', label: 'App Settings…', category: 'App', scope: 'global', defaultCombo: 'CmdOrCtrl+,' },
  { id: 'save-setup', label: 'Save Setup', category: 'File', scope: 'global', defaultCombo: 'CmdOrCtrl+S' },
  {
    id: 'save-as-studio',
    label: 'Save as Studio…',
    category: 'File',
    scope: 'global',
    defaultCombo: 'CmdOrCtrl+Shift+S'
  },
  { id: 'export-pdf', label: 'Export PDF…', category: 'File', scope: 'global', defaultCombo: 'CmdOrCtrl+E' },
  {
    id: 'export-spreadsheet',
    label: 'Export Spreadsheet…',
    category: 'File',
    scope: 'global',
    defaultCombo: 'CmdOrCtrl+Shift+E'
  },
  {
    id: 'toggle-mode',
    label: 'Toggle Layout/Table Mode',
    category: 'File',
    scope: 'global',
    defaultCombo: 'CmdOrCtrl+L'
  },
  { id: 'undo', label: 'Undo', category: 'Edit', scope: 'global', defaultCombo: 'CmdOrCtrl+Z' },
  { id: 'redo', label: 'Redo', category: 'Edit', scope: 'global', defaultCombo: 'CmdOrCtrl+Shift+Z' },
  // Select All is NOT here (unlike every other Edit action) — it's a fixed CmdOrCtrl+A native menu
  // accelerator (menu.ts), same category as cut/copy/paste, because the OS only routes that combo
  // into a focused text field via a real menu accelerator. A user-rebindable combo would only ever
  // work for the "select every row/block" half, never the "select all text in this field" half —
  // see menu.ts's installAppMenu doc comment.
  { id: 'add-source', label: 'Add Source', category: 'Edit', scope: 'global', defaultCombo: 'CmdOrCtrl+N' },
  {
    id: 'delete-selection',
    label: 'Delete Selection',
    category: 'Edit',
    scope: 'global',
    defaultCombo: 'CmdOrCtrl+Backspace'
  },
  {
    id: 'duplicate-selection',
    label: 'Duplicate',
    category: 'Edit',
    scope: 'global',
    defaultCombo: 'CmdOrCtrl+D'
  },
  {
    id: 'open-setup-settings',
    label: 'Setup Settings…',
    category: 'Edit',
    scope: 'global',
    defaultCombo: 'CmdOrCtrl+G'
  },
  {
    id: 'clear-selection',
    label: 'Clear Selection',
    category: 'Edit',
    scope: 'global',
    defaultCombo: 'Escape',
    allowBareKey: true
  },
  {
    id: 'sequential-numbering',
    label: 'Number Selected Rows…',
    category: 'Table',
    scope: 'table',
    defaultCombo: 'CmdOrCtrl+Shift+N'
  },
  {
    id: 'delete-selection-table',
    label: 'Delete Selected Rows',
    category: 'Table',
    scope: 'table',
    defaultCombo: 'Delete',
    allowBareKey: true
  },
  { id: 'zoom-in', label: 'Zoom In', category: 'Layout', scope: 'layout', defaultCombo: 'CmdOrCtrl+Shift+=' },
  { id: 'zoom-out', label: 'Zoom Out', category: 'Layout', scope: 'layout', defaultCombo: 'CmdOrCtrl+Shift+-' },
  { id: 'reset-view', label: 'Reset View', category: 'Layout', scope: 'layout', defaultCombo: 'CmdOrCtrl+Shift+0' },
  {
    id: 'delete-selection-layout',
    label: 'Delete Selected Blocks',
    category: 'Layout',
    scope: 'layout',
    defaultCombo: 'Delete',
    allowBareKey: true
  }
]

export const KEYBIND_ACTIONS_BY_ID: Record<string, KeybindActionDef> = Object.fromEntries(
  KEYBIND_ACTIONS.map((a) => [a.id, a])
)

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent)

const KEY_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backspace: '⌫',
  Delete: 'Del',
  Escape: 'Esc',
  ' ': 'Space'
}

/** Normalizes a raw key name (from a live KeyboardEvent.key or a stored combo's tail segment)
 *  into the canonical token used throughout this module. */
function normalizeKeyToken(key: string): string {
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key
}

/** Builds the canonical combo string for a live keydown event, e.g. "CmdOrCtrl+Shift+Z". Returns
 *  null while only a modifier key itself is being held (e.evt.key is Meta/Control/Shift/Alt) —
 *  the recorder should keep waiting for the actual key in that case. `CmdOrCtrl` abstracts Cmd
 *  (mac) / Ctrl (windows/linux), matching Electron's own accelerator convention so the format
 *  stays familiar and the hand-authored defaults above need no per-platform variants. */
export function normalizeKeyEvent(e: KeyboardEvent): string | null {
  if (e.key === 'Meta' || e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt') return null
  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('CmdOrCtrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  parts.push(normalizeKeyToken(e.key))
  return parts.join('+')
}

/** True if a combo has at least one modifier segment (CmdOrCtrl/Shift/Alt). */
export function comboHasModifier(combo: string): boolean {
  const parts = combo.split('+')
  return parts.length > 1
}

/** Human-readable form for display in the Keybinds settings UI — platform-appropriate symbols on
 *  mac, spelled-out modifier names elsewhere. */
export function formatCombo(combo: string): string {
  return combo
    .split('+')
    .map((part) => {
      if (part === 'CmdOrCtrl') return IS_MAC ? '⌘' : 'Ctrl'
      if (part === 'Shift') return IS_MAC ? '⇧' : 'Shift'
      if (part === 'Alt') return IS_MAC ? '⌥' : 'Alt'
      return KEY_LABELS[part] ?? part
    })
    .join(IS_MAC ? '' : '+')
}

/** Two scopes overlap (and so must be conflict-checked against each other) unless they're the
 *  two mutually-exclusive editor modes — table and layout are never visible at the same time, so
 *  the same physical key in each is never actually ambiguous to the user. */
export function scopesOverlap(a: KeybindScope, b: KeybindScope): boolean {
  if (a === 'global' || b === 'global') return true
  return a === b
}
