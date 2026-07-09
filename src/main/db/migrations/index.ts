import type Database from 'better-sqlite3'
import initSql from './001_init.sql?raw'
import { run as seedBerkleeData } from './002_seed_berklee_data'
import { run as roomLayoutBlocks } from './003_room_layout_blocks'
import { run as outboardBuildingFacultyPools } from './004_outboard_building_faculty_pools'
import { run as channelPresets } from './005_channel_presets'
import { run as renameLayoutFiles } from './006_rename_layout_files'
import { run as setupFacultyReserve } from './007_setup_faculty_reserve'
import { run as consoleAndPreamps } from './008_console_and_preamps'

export interface SqlMigration {
  version: number
  sql: string
}

export interface RunMigration {
  version: number
  run: (db: Database.Database) => void
}

export type Migration = SqlMigration | RunMigration

export const MIGRATIONS: Migration[] = [
  { version: 1, sql: initSql },
  { version: 2, run: seedBerkleeData },
  { version: 3, run: roomLayoutBlocks },
  { version: 4, run: outboardBuildingFacultyPools },
  { version: 5, run: channelPresets },
  { version: 6, run: renameLayoutFiles },
  { version: 7, run: setupFacultyReserve },
  { version: 8, run: consoleAndPreamps }
]
