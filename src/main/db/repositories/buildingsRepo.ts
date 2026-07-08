import type { Building } from '@shared/types/entities'
import { getDb } from '../index'

interface BuildingRow {
  id: number
  name: string
  created_at: string
}

function mapRow(row: BuildingRow): Building {
  return { id: row.id, name: row.name, createdAt: row.created_at }
}

export function listBuildings(): Building[] {
  const rows = getDb().prepare('SELECT * FROM buildings ORDER BY name').all() as BuildingRow[]
  return rows.map(mapRow)
}

export function createBuilding(name: string): Building {
  const info = getDb().prepare('INSERT INTO buildings (name) VALUES (?)').run(name)
  const row = getDb().prepare('SELECT * FROM buildings WHERE id = ?').get(info.lastInsertRowid) as BuildingRow
  return mapRow(row)
}

export function renameBuilding(id: number, name: string): void {
  getDb().prepare('UPDATE buildings SET name = ? WHERE id = ?').run(name, id)
}

export function removeBuilding(id: number): void {
  getDb().prepare('DELETE FROM buildings WHERE id = ?').run(id)
}
