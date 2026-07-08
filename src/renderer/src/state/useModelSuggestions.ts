import { useMemo } from 'react'

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
      if (item.manufacturer?.trim().toLowerCase() === trimmed) set.add(item.name.trim())
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [items, manufacturer])
}
