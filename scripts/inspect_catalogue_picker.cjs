const Database = require('better-sqlite3')
const path = require('node:path')
const os = require('node:os')

function getDbPath() {
  const platform = process.platform
  const appName = 'setup-sheet-helper'
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName, `${appName}.sqlite`)
  }
  if (platform === 'win32') {
    return path.join(process.env.APPDATA || '', appName, `${appName}.sqlite`)
  }
  return path.join(os.homedir(), '.config', appName, `${appName}.sqlite`)
}

const db = new Database(getDbPath(), { readonly: true })

console.log('--- All pool_type=studio mics, most recent first ---')
console.log(
  db
    .prepare(
      `SELECT m.id, m.name, m.manufacturer, m.studio_id,
              s.id AS studio_exists, s.name AS studio_name, s.building_id, s.is_temporary
       FROM mics m LEFT JOIN studios s ON s.id = m.studio_id
       WHERE m.pool_type = 'studio'
       ORDER BY m.id DESC
       LIMIT 30`
    )
    .all()
)

console.log('--- Orphaned studio-pool mics (studio_id not in studios) ---')
console.log(
  db
    .prepare(
      `SELECT m.id, m.name, m.manufacturer, m.studio_id
       FROM mics m
       WHERE m.pool_type = 'studio' AND m.studio_id NOT IN (SELECT id FROM studios)`
    )
    .all()
)

console.log('--- Custom (buildingless) studios, mic counts, most recent first ---')
console.log(
  db
    .prepare(
      `SELECT s.id, s.name, s.created_at, s.is_temporary,
              (SELECT COUNT(*) FROM mics WHERE studio_id = s.id AND pool_type='studio') AS mic_count
       FROM studios s
       WHERE s.building_id IS NULL
       ORDER BY s.created_at DESC
       LIMIT 20`
    )
    .all()
)

db.close()
