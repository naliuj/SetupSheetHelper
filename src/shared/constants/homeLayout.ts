/** How the home screen presents studios/templates and saved setups. A user preference
 *  (Settings → General), stored as a single app-setting string and applied to both home sections. */
export type HomeLayout = 'blocks' | 'tree' | 'twoPane' | 'miller'

export const HOME_LAYOUTS: { id: HomeLayout; label: string; description: string }[] = [
  { id: 'blocks', label: 'Blocks', description: 'Card grid; click a folder to open it.' },
  { id: 'tree', label: 'File tree', description: 'Expandable nested tree — the whole hierarchy at once.' },
  { id: 'twoPane', label: 'Two-pane', description: 'Folder list on the left, its contents on the right.' },
  { id: 'miller', label: 'Columns', description: 'Cascading columns — each folder opens the next pane.' }
]

const HOME_LAYOUT_IDS = HOME_LAYOUTS.map((l) => l.id)

/** Coerce a stored/unknown value to a valid layout; anything unrecognized falls back to blocks. */
export function parseHomeLayout(value: string | null | undefined): HomeLayout {
  return HOME_LAYOUT_IDS.includes(value as HomeLayout) ? (value as HomeLayout) : 'blocks'
}
