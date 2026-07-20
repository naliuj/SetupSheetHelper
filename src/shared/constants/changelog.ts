// The "What's New" changelog shown to users after an app upgrade (see whatsNewStore.ts) and
// reachable anytime via the "What's New…" menu item. Every version bump gets an entry here, even
// minimal/internal-only ones — never skip or merge entries, since changelogUtils.ts compares by
// array index against this list, and a missing version would throw off that comparison for every
// version after it.

export interface ChangelogEntry {
  version: string
  /** YYYY-MM-DD, from the version-bump commit's date. Optional — purely cosmetic. */
  date?: string
  /** 1-4 short, user-facing bullets. Plain language, not raw commit messages. */
  highlights: string[]
}

// Oldest → newest. Array order IS the chronology used for "what's new since last seen" — see
// changelogUtils.ts.
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '0.1.0',
    date: '2026-07-08',
    highlights: ['Initial release.']
  },
  {
    version: '1.0.0',
    date: '2026-07-09',
    highlights: [
      'Added undo/redo for both Table Mode and Layout Mode.',
      'You can now upload a room layout file and lay out gear visually in Layout Mode.',
      'Added a per-setup Setup Settings screen with faculty reserve gear controls.',
      'Added a dark/light theme toggle in Settings.',
      'Fixed PDF export sometimes leaving out the room layout page.',
      'Renamed the app to "Setup Sheet Helper".'
    ]
  },
  {
    version: '1.1.0',
    date: '2026-07-10',
    highlights: [
      'Added Layout Mode power tools for faster room-layout editing.',
      "Berklee's built-in studios and gear are now optional — hide or disable them entirely from Settings.",
      'Added the ability to remove an outboard column from the setup sheet.',
      'Various bug fixes and cleanup.'
    ]
  },
  {
    version: '1.2.0',
    date: '2026-07-11',
    highlights: ['Redesigned the Layout Palette editor with a grouped, collapsible layout.']
  },
  {
    version: '1.3.0',
    date: '2026-07-11',
    highlights: ['Decluttered Table Mode with a cleaner toolbar and a selection bar that only appears when you need it.']
  },
  {
    version: '1.4.0',
    date: '2026-07-11',
    highlights: ['More keyboard shortcuts are now reflected in the menu bar.']
  },
  {
    version: '1.5.0',
    date: '2026-07-11',
    highlights: ['General usability polish across the app.']
  },
  {
    version: '1.6.0',
    date: '2026-07-11',
    highlights: [
      'Fixed dragging multiple rows at once in Table Mode.',
      'Fixed a Layout Mode zoom boundary bug.',
      'Fixed auto-selection behavior when adding a new source.'
    ]
  },
  {
    version: '1.7.0',
    date: '2026-07-11',
    highlights: ['Added a dedicated Channel Preset manager with folders, reordering, and editing.']
  },
  {
    version: '1.7.1',
    date: '2026-07-11',
    highlights: ["Refreshed the app's visual style with a flatter, sharper look and more compact palette blocks."]
  },
  {
    version: '1.7.2',
    date: '2026-07-11',
    highlights: ['Added a unified color picker, and the ability to color individual rows in Table Mode.']
  },
  {
    version: '1.7.3',
    date: '2026-07-11',
    highlights: ['Polished row colors and the selection bar for better visibility.']
  },
  {
    version: '1.7.4',
    date: '2026-07-11',
    highlights: [
      'PDF export: long content now wraps, columns auto-fit, and you can choose orientation and density.',
      'Fixed washed-out row colors in light mode.'
    ]
  },
  {
    version: '1.7.5',
    date: '2026-07-11',
    highlights: [
      'Fixed a PDF export overflow bug.',
      'Added standard copy/paste menu items.',
      "Channel Presets now export with their assigned color."
    ]
  },
  {
    version: '1.7.6',
    date: '2026-07-11',
    highlights: ['Restyled form controls across the app: themed inputs, toggles, chips, and checkboxes.']
  },
  {
    version: '1.7.7',
    date: '2026-07-11',
    highlights: ['Added per-column visibility (a global default plus per-setup control) and a 48V column.']
  },
  {
    version: '1.7.8',
    date: '2026-07-11',
    highlights: ['Performance improvements: faster undo, smoother rendering, and quicker loading.']
  },
  {
    version: '1.8.0',
    date: '2026-07-12',
    highlights: ['Added PDF layout style settings: grid lines, zebra striping, header shading, and an accent color.']
  },
  {
    version: '1.8.1',
    date: '2026-07-12',
    highlights: ['UI polish: fixed an empty-tab bug, added a save confirmation, and improved focus indicators.']
  },
  {
    version: '1.8.2',
    date: '2026-07-12',
    highlights: [
      'Added table-mode row hotkeys, an Escape shortcut to clear selection, and Layout Mode nudge keys.',
      'Fixed a Layout Mode resize boundary bug.'
    ]
  },
  {
    version: '1.8.3',
    date: '2026-07-12',
    highlights: ['Added a customizable keybind system — rebind shortcuts in Settings → Keybinds, with conflict warnings.']
  },
  {
    version: '1.8.4',
    date: '2026-07-12',
    highlights: ['Added undo toasts, clearer export warnings, and on-screen shortcut hints.']
  },
  {
    version: '1.8.5',
    date: '2026-07-12',
    highlights: [
      'Studios and setups now live in separate folder trees, with an inline folder picker.',
      'Added selectable home-screen layouts (Settings → General).'
    ]
  },
  {
    version: '1.8.6',
    date: '2026-07-12',
    highlights: [
      'Berklee studios now appear as an inline folder subtree in every home-screen layout.',
      'File tree folders can now be toggled by clicking anywhere on their row.'
    ]
  },
  {
    version: '1.8.7',
    date: '2026-07-12',
    highlights: ['Replaced emoji icons across the app with a consistent icon set, including on the home screen.']
  },
  {
    version: '1.8.8',
    date: '2026-07-13',
    highlights: ['Added a Close button to Setup Settings, and Escape now closes it too.']
  },
  {
    version: '1.8.9',
    date: '2026-07-14',
    highlights: [
      'Added stereo-pair mic linking in Table Mode — link two rows and their mic, outboard, 48V, and channel settings stay in sync.',
      'Added a session notes field, and musician names on Layout Mode blocks.',
      'Mic/outboard/preamp pickers gained a "No Mic"/"No Outboard"/"No Preamp" clear option.'
    ]
  },
  {
    version: '1.8.10',
    date: '2026-07-15',
    highlights: ['Added credits to the General settings tab, and renamed "Columns (new setup default)" to just "Columns".']
  },
  {
    version: '1.8.11',
    date: '2026-07-15',
    highlights: ['Fixed "Check for Updates" failing with a 404 — it now checks the public releases feed instead of the private source repo.']
  },
  {
    version: '1.8.12',
    date: '2026-07-15',
    highlights: ['Added an Intel Mac build alongside the Apple Silicon build.']
  },
  {
    version: '1.8.13',
    date: '2026-07-15',
    highlights: [
      'Added a new app icon.',
      'Fixed Cmd/Ctrl+A not selecting text in most text fields.',
      'Added a "Donate (If you want)" link to the credits in General settings.'
    ]
  },
  {
    version: '1.8.14',
    date: '2026-07-16',
    highlights: [
      'Added an in-app feedback form (Settings → Feedback) for Feature Requests, Bug Reports, and Other.',
      'Layout Mode: if a studio has no room layout, you can now continue with a blank sheet instead of only uploading one.',
      'Uploading a room layout from Layout Mode now asks whether to save it to the studio (shared) or just this setup.'
    ]
  },
  {
    version: '1.8.15',
    date: '2026-07-16',
    highlights: [
      'The home screen now leads with studio templates instead of Quick Setup, to make reusable studios easier to find.',
      "Quick Setup's mic/outboard/preamp fields are now plain text boxes with type-ahead suggestions, not a dropdown.",
      'PDF export now only offers a "Room layout" option when there\'s actually a layout to include.'
    ]
  },
  {
    version: '1.8.16',
    date: '2026-07-16',
    highlights: [
      'Stereo linking now works on any two adjacent rows — including a pair that lands on an even row, which couldn\'t be linked before.',
      'The app now re-checks for updates every couple of hours while it\'s open, so leaving it running for days no longer means missing an update.'
    ]
  },
  {
    version: '1.8.17',
    date: '2026-07-18',
    highlights: [
      'Fixed the app icon\'s corners getting clipped by macOS\'s rounded-icon mask.',
      'Refreshed the Studio A, B, and E room-layout PDFs to the updated floor plans for installs that had already loaded the old ones.',
      'PDF export\'s "Colored" option now also applies to Layout Mode — turn it off for a black-and-white room layout with lightly shaded blocks.',
      'Redesigned the Layout Palette editor in Settings with categories on one side and that category\'s blocks on the other, plus an easy way to remove blocks and whole categories.',
      'Added a built-in "Gobo" block to the Utility category.',
      'Dragging multiple selected blocks in Layout Mode now moves them together smoothly instead of the rest snapping into place at the end.'
    ]
  },
  {
    version: '1.9.0',
    date: '2026-07-19',
    highlights: [
      'Added a "PDF style settings" link to the Export to PDF dialog, jumping straight to Settings.',
      'Added a session date format setting to PDF Layout settings (MM/DD/YYYY, Month D YYYY, YYYY-MM-DD, or DD/MM/YYYY).',
      'Added the app icon next to the title in the top bar.'
    ]
  }
]
