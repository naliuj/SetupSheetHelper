import type { Mic, OutboardGear } from '@shared/types/entities'
import type { ChannelPresetItem } from '@shared/types/channelPreset'
import type { ResolvedChannelPresetItem } from './setupStore'

function findMatch<T extends { name: string; manufacturer: string | null }>(
  items: T[],
  name: string,
  manufacturer: string | null
): T | null {
  const normalizedName = name.trim().toLowerCase()
  const normalizedManufacturer = (manufacturer ?? '').trim().toLowerCase()
  return (
    items.find(
      (item) =>
        item.name.trim().toLowerCase() === normalizedName &&
        (item.manufacturer ?? '').trim().toLowerCase() === normalizedManufacturer
    ) ?? null
  )
}

/** Matches a Channel Preset's captured mic/outboard (by name+manufacturer) against the
 *  current studio's catalogue. Unmatched references still produce a row — just unassigned,
 *  with the original name carried through so the table can show a hint. */
export function resolveChannelPresetItems(
  presetItems: ChannelPresetItem[],
  mics: Mic[],
  outboardGear: OutboardGear[]
): ResolvedChannelPresetItem[] {
  return presetItems.map((item) => {
    const mic = item.micName ? findMatch(mics, item.micName, item.micManufacturer) : null
    const outboard = item.outboardName ? findMatch(outboardGear, item.outboardName, item.outboardManufacturer) : null
    return {
      instrumentType: item.instrumentType,
      sourceName: item.sourceName,
      micId: mic?.id ?? null,
      micName: item.micName,
      outboardId: outboard?.id ?? null,
      outboardName: item.outboardName,
      channel: item.channel,
      tieLine: item.tieLine,
      cueBox: item.cueBox,
      polarityFlip: item.polarityFlip,
      notes: item.notes,
      unresolvedMicName: item.micName && !mic ? item.micName : undefined,
      unresolvedOutboardName: item.outboardName && !outboard ? item.outboardName : undefined
    }
  })
}
