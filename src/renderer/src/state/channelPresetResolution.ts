import type { Mic, OutboardGear, Preamp } from '@shared/types/entities'
import type { ChannelPresetItem } from '@shared/types/channelPreset'
import type { ResolvedChannelPresetItem } from './setupStore'
import { canonicalMicKey } from '@shared/constants/berkleeMicRenames'

/** Trimmed, case-insensitive name+manufacturer — how outboard and preamps have always matched. */
function plainGearKey(manufacturer: string | null, name: string): string {
  return `${(manufacturer ?? '').trim().toLowerCase()}|${name.trim().toLowerCase()}`
}

function findMatch<T extends { name: string; manufacturer: string | null }>(
  items: T[],
  name: string,
  manufacturer: string | null,
  keyOf: (manufacturer: string | null, name: string) => string = plainGearKey
): T | null {
  const wanted = keyOf(manufacturer, name)
  return items.find((item) => keyOf(item.manufacturer, item.name) === wanted) ?? null
}

/** Matches a Channel Preset's captured mic/outboard (by name+manufacturer) against the
 *  current studio's catalogue. Unmatched references still produce a row — just unassigned,
 *  with the original name carried through so the table can show a hint. */
export function resolveChannelPresetItems(
  presetItems: ChannelPresetItem[],
  mics: Mic[],
  outboardGear: OutboardGear[],
  preamps: Preamp[]
): ResolvedChannelPresetItem[] {
  return presetItems.map((item) => {
    // Mics match through canonicalMicKey, so a preset saved before a Berklee mic was renamed
    // (e.g. "VMA Tube Microphone") still finds it under its current name, and vice versa.
    const mic = item.micName ? findMatch(mics, item.micName, item.micManufacturer, canonicalMicKey) : null
    const outboard = item.outboardName ? findMatch(outboardGear, item.outboardName, item.outboardManufacturer) : null
    const preamp = item.preampName ? findMatch(preamps, item.preampName, item.preampManufacturer) : null
    return {
      instrumentType: item.instrumentType,
      sourceName: item.sourceName,
      micId: mic?.id ?? null,
      micName: item.micName,
      outboardId: outboard?.id ?? null,
      outboardName: item.outboardName,
      preampId: preamp?.id ?? null,
      preampName: item.preampName,
      channel: item.channel,
      tieLine: item.tieLine,
      cueBox: item.cueBox,
      polarityFlip: item.polarityFlip,
      notes: item.notes,
      color: item.color,
      unresolvedMicName: item.micName && !mic ? item.micName : undefined,
      unresolvedOutboardName: item.outboardName && !outboard ? item.outboardName : undefined,
      unresolvedPreampName: item.preampName && !preamp ? item.preampName : undefined
    }
  })
}
