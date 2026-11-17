/** Drops a leading "<manufacturer> " from an item's name — used both when displaying an item inside
 *  a manufacturer's own submenu, and when storing a manually-typed gear name that already redundantly
 *  repeats the manufacturer (e.g. name "AKG C414" + manufacturer "AKG" becomes "C414"). */
export function stripManufacturerPrefix(name: string, manufacturer: string): string {
  const prefix = manufacturer.trim()
  if (!prefix) return name
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const stripped = name.replace(new RegExp(`^${escaped}\\s+`, 'i'), '').trim()
  return stripped || name
}

/** Display label for a piece of gear: "<manufacturer> <model>", with the manufacturer never
 *  repeated. Gear names in this app are inconsistent about whether they already embed the
 *  manufacturer — most outboard rows are stored as name "API 2500" + manufacturer "API", while
 *  every mic is stored as name "C414 XL" + manufacturer "AKG" — so a plain
 *  `${manufacturer} ${name}` renders "API API 2500" for one and correctly for the other. That is
 *  the whole reason the same model can appear twice in a suggestion list: once via each spelling.
 *  Keep the manufacturer IN the label (unlike resolveGearLabels, which drops it because the export
 *  has a separate column for it) — suggestion popups filter on the whole string, so searching by
 *  brand has to keep working. */
export function formatGearLabel(name: string, manufacturer: string | null): string {
  const trimmed = manufacturer?.trim()
  if (!trimmed) return name.trim()
  return `${trimmed} ${stripManufacturerPrefix(name, trimmed)}`
}

/** Case- and whitespace-normalized identity for a piece of gear, ignoring which pool stocks it.
 *  Used to collapse the same model to one entry — either in a suggestion list or in the picker's
 *  search results. NOT the same as usageCounts.ts's `gearKey`, which deliberately keeps the pool
 *  and owner in the key so a Personal-locker unit never shares capacity with the studio's. */
export function gearIdentityKey(name: string, manufacturer: string | null): string {
  const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')
  return `${norm(manufacturer ?? '')}|${norm(name)}`
}

/** Files gear the way an engineer reads a locker list: manufacturer A to Z, then model within it.
 *  `numeric` so an API 512c sorts before an API 3124 instead of "3" beating "5" character by
 *  character, and a base sensitivity so "dbx" and "DBX" don't split one manufacturer into two.
 *  Blank manufacturers go last, since there is no name to file them under. */
export function byManufacturerThenModel(
  a: { name: string; manufacturer: string | null },
  b: { name: string; manufacturer: string | null }
): number {
  const makeA = a.manufacturer?.trim() ?? ''
  const makeB = b.manufacturer?.trim() ?? ''
  const collate = { numeric: true, sensitivity: 'base' } as const

  if ((makeA === '') !== (makeB === '')) return makeA === '' ? 1 : -1

  const byMake = makeA.localeCompare(makeB, undefined, collate)
  if (byMake !== 0) return byMake

  // Compare the model, not the stored name: this catalogue is inconsistent about whether a name
  // repeats its own manufacturer, so raw names file the same locker under two letters — "610"
  // under 6 and "Universal Audio 1176" under U, with both makers reading "Universal Audio".
  return stripManufacturerPrefix(a.name, makeA).localeCompare(
    stripManufacturerPrefix(b.name, makeB),
    undefined,
    collate
  )
}
