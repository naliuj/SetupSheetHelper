/** Captures real rows from a live setup by mic/outboard name+manufacturer (portable across
 *  studios — a raw mic_id/outboard_id FK would only resolve within the studio it was captured
 *  from). Which fields get captured is a save-time choice; skipped fields are simply left
 *  null, same as an ordinary unset row. */
export interface ChannelPresetItem {
  id: number
  presetId: number
  sortOrder: number
  instrumentType: string
  sourceName: string
  micName: string | null
  micManufacturer: string | null
  outboardName: string | null
  outboardManufacturer: string | null
  preampName: string | null
  preampManufacturer: string | null
  channel: number | null
  tieLine: number | null
  cueBox: string | null
  polarityFlip: boolean | null
  notes: string | null
  color: string | null
}

export interface ChannelPreset {
  id: number
  name: string
  description: string | null
  /** The preset-folder this is filed under (its own namespace, separate from setup/studio
   *  folders); null means unfiled / root level. */
  folderId: number | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ChannelPresetWithItems extends ChannelPreset {
  items: ChannelPresetItem[]
}

export interface ChannelPresetItemInput {
  instrumentType: string
  sourceName: string
  micName: string | null
  micManufacturer: string | null
  outboardName: string | null
  outboardManufacturer: string | null
  preampName: string | null
  preampManufacturer: string | null
  channel: number | null
  tieLine: number | null
  cueBox: string | null
  polarityFlip: boolean | null
  notes: string | null
  color: string | null
}
