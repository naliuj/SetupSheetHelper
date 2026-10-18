import type Database from 'better-sqlite3'

/** Source name became an ordinary column key — movable and hideable like the rest — so from now on
 *  a stored visible-columns list that leaves it out means the user switched it off. Every list
 *  saved before this release leaves it out too, while the sheet still showed it, so add it to each
 *  of them: the per-setup `setups.visible_columns` and the global default in app_settings.
 *
 *  No schema change. NULL (never configured) still means every column visible, so those rows are
 *  left alone. Unparseable values are left for parseVisibleColumns to fall back on, as before.
 *  Column ORDER needs nothing here: parseColumnOrder puts a missing `sourceName` back right after
 *  the stereo lane, where it always drew. */
function withSourceName(raw: string): string | null {
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr) || arr.includes('sourceName')) return null
    return JSON.stringify(['sourceName', ...arr])
  } catch {
    return null
  }
}

export function run(db: Database.Database): void {
  const setups = db
    .prepare('SELECT id, visible_columns FROM setups WHERE visible_columns IS NOT NULL')
    .all() as { id: number; visible_columns: string }[]
  const updateSetup = db.prepare('UPDATE setups SET visible_columns = ? WHERE id = ?')
  for (const row of setups) {
    const next = withSourceName(row.visible_columns)
    if (next) updateSetup.run(next, row.id)
  }

  const setting = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'default_visible_columns'`)
    .get() as { value: string | null } | undefined
  const next = setting?.value ? withSourceName(setting.value) : null
  if (next) db.prepare(`UPDATE app_settings SET value = ? WHERE key = 'default_visible_columns'`).run(next)
}
