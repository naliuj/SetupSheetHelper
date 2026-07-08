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
