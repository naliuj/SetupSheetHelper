import { useEffect, useMemo, useState } from 'react'
import type { MicWithStudio, OutboardGearWithStudio } from '@shared/types/entities'
import { MANUFACTURER_PREFIXES } from '@shared/constants/manufacturers'

interface GearCatalogueSuggestions {
  manufacturers: string[]
  mics: MicWithStudio[]
  outboard: OutboardGearWithStudio[]
}

/** Fetches every mic/outboard item across every studio once, for use as autocomplete source
 *  data — manufacturer suggestions, and (paired with useModelSuggestions) model-name
 *  suggestions once a manufacturer is chosen. Consolidates what PersonalGearEditor.tsx and
 *  SetupGearLocker.tsx each used to fetch and derive manufacturer suggestions from separately. */
export function useGearCatalogueSuggestions(): GearCatalogueSuggestions {
  const [mics, setMics] = useState<MicWithStudio[]>([])
  const [outboard, setOutboard] = useState<OutboardGearWithStudio[]>([])

  useEffect(() => {
    window.api.mics.listAllWithStudio().then(setMics)
    window.api.outboard.listAllWithStudio().then(setOutboard)
  }, [])

  const manufacturers = useMemo(() => {
    const set = new Set<string>()
    for (const m of mics) if (m.manufacturer) set.add(m.manufacturer.trim())
    for (const o of outboard) if (o.manufacturer) set.add(o.manufacturer.trim())
    for (const p of MANUFACTURER_PREFIXES) set.add(p)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [mics, outboard])

  return { manufacturers, mics, outboard }
}
