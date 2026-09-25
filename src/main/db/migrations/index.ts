import type Database from 'better-sqlite3'
import initSql from './001_init.sql?raw'
import { run as seedBerkleeData } from './002_seed_berklee_data'
import { run as roomLayoutBlocks } from './003_room_layout_blocks'
import { run as outboardBuildingFacultyPools } from './004_outboard_building_faculty_pools'
import { run as channelPresets } from './005_channel_presets'
import { run as renameLayoutFiles } from './006_rename_layout_files'
import { run as setupFacultyReserve } from './007_setup_faculty_reserve'
import { run as consoleAndPreamps } from './008_console_and_preamps'
import { run as channelPresetPreamps } from './009_channel_preset_preamps'
import { run as preampPoolExpansion } from './010_preamp_pool_expansion'
import { run as outboardSlots } from './011_outboard_slots'
import { run as paletteItems } from './012_palette_items'
import { run as removeHasConsole } from './013_remove_has_console'
import { run as presetFolders } from './014_preset_folders'
import { run as rowColor } from './015_row_color'
import { run as paletteDefaultColors } from './016_palette_default_colors'
import { run as channelPresetColor } from './017_channel_preset_color'
import { run as setupVisibleColumns } from './018_setup_visible_columns'
import { run as phantomPower } from './019_phantom_power'
import { run as folderScope } from './020_folder_scope'
import { run as blockPersonName } from './021_block_person_name'
import { run as setupSessionNotes } from './022_setup_session_notes'
import { run as micGroup } from './023_mic_group'
import { run as dropOrphanedGroupRole } from './024_drop_orphaned_group_role'
import { run as consolidateNiceDi } from './025_consolidate_nice_di'
import { run as setupLayoutOverrides } from './026_setup_layout_overrides'
import { run as refreshBerkleeLayoutPdfs } from './027_refresh_berklee_layout_pdfs'
import { run as utilitiesGobo } from './028_utilities_gobo'
import { run as paletteBlockDefaultSize } from './029_palette_block_default_size'
import { run as goboHeight } from './030_gobo_height'
import { run as setupEditorMode } from './031_setup_editor_mode'
// Numbered 34, not 32: versions 32 and 33 were burned by the abandoned Multi Setup feature
// (032_multi_setups, 033_multi_setup_links), superseded by Split View. Deleting that branch did
// NOT free the numbers: anyone who ran a build of it still has those two recorded in
// schema_migrations, so a migration reusing 32 would be silently skipped on their machine and its
// column would never exist. Never reuse a version number that any shipped or run branch has
// claimed — the runner keys off the version, not the file. The work is kept at the
// archive/multi-setup tag if it is ever wanted back.
import { run as setupColumnOrder } from './034_setup_column_order'
import { run as refreshBerkleeMicLockers } from './035_refresh_berklee_mic_lockers'
import { run as exportColumnOverrides } from './036_export_column_overrides'
import { run as berkleePreamps } from './037_berklee_preamps'
import { run as standardizeGearNames } from './038_standardize_gear_names'
import { run as themePreferenceBackfill } from './039_theme_preference_backfill'
import { run as studio2Cmc6Mk4Quantity } from './040_studio2_cmc6_mk4_quantity'
import { run as studio3Cmc6Mk4Name } from './041_studio3_cmc6_mk4_name'

import type { MigrationContext } from '../migrate'

export interface SqlMigration {
  version: number
  sql: string
}

export interface RunMigration {
  version: number
  /** `ctx` is optional to every existing migration: a `(db) => void` is assignable to this, so
   *  none of them needed touching when it was added. */
  run: (db: Database.Database, ctx: MigrationContext) => void
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
  { version: 8, run: consoleAndPreamps },
  { version: 9, run: channelPresetPreamps },
  { version: 10, run: preampPoolExpansion },
  { version: 11, run: outboardSlots },
  { version: 12, run: paletteItems },
  { version: 13, run: removeHasConsole },
  { version: 14, run: presetFolders },
  { version: 15, run: rowColor },
  { version: 16, run: paletteDefaultColors },
  { version: 17, run: channelPresetColor },
  { version: 18, run: setupVisibleColumns },
  { version: 19, run: phantomPower },
  { version: 20, run: folderScope },
  { version: 21, run: blockPersonName },
  { version: 22, run: setupSessionNotes },
  { version: 23, run: micGroup },
  { version: 24, run: dropOrphanedGroupRole },
  { version: 25, run: consolidateNiceDi },
  { version: 26, run: setupLayoutOverrides },
  { version: 27, run: refreshBerkleeLayoutPdfs },
  { version: 28, run: utilitiesGobo },
  { version: 29, run: paletteBlockDefaultSize },
  { version: 30, run: goboHeight },
  { version: 31, run: setupEditorMode },
  { version: 34, run: setupColumnOrder },
  { version: 35, run: refreshBerkleeMicLockers },
  { version: 36, run: exportColumnOverrides },
  { version: 37, run: berkleePreamps },
  { version: 38, run: standardizeGearNames },
  { version: 39, run: themePreferenceBackfill },
  { version: 40, run: studio2Cmc6Mk4Quantity },
  { version: 41, run: studio3Cmc6Mk4Name }
]
