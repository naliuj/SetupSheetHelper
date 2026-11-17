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
