import { useMemo } from 'react'
import { stripManufacturerPrefix } from '@shared/utils/manufacturerPrefix'

interface NamedManufacturedItem {
  name: string
  manufacturer: string | null
}

/** Model-name suggestions for a "add gear" form's name field, scoped to whichever manufacturer
 *  is currently typed in — empty until a manufacturer is chosen, since "every model ever saved"
 *  is too broad to be useful as a name suggestion on its own. */
export function useModelSuggestions<T extends NamedManufacturedItem>(items: T[], manufacturer: string): string[] {
  return useMemo(() => {
    const trimmed = manufacturer.trim().toLowerCase()
    if (!trimmed) return []
    const set = new Set<string>()
    for (const item of items) {
      // Strip the brand back off: many rows store it in the name too ("Universal Audio 6176"),
      // and this list is already scoped to one manufacturer, so leaving it in offers the user
      // "Universal Audio 6176" as a MODEL. The save path strips it anyway — this just stops the
      // suggestion from reading doubled.
      if (item.manufacturer?.trim().toLowerCase() === trimmed) {
        set.add(stripManufacturerPrefix(item.name, item.manufacturer ?? ''))
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [items, manufacturer])
}
