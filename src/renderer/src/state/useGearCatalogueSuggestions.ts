import { useEffect, useMemo, useState } from 'react'
import type { Mic, OutboardGear } from '@shared/types/entities'
import { MANUFACTURER_PREFIXES } from '@shared/constants/manufacturers'

interface GearCatalogueSuggestions {
  manufacturers: string[]
  mics: Mic[]
  outboard: OutboardGear[]
}

/** Fetches every mic/outboard item across every pool (studio lockers, building pools, faculty
 *  reserve, personal, setup-scoped) once, for use as autocomplete source data — manufacturer
 *  suggestions, and (paired with useModelSuggestions) model-name suggestions once a
 *  manufacturer is chosen. Deliberately NOT scoped to studio-pool only (unlike
 *  listAllMicsWithStudio, built for the "copy gear from other studios" picker) — a model that
 *  only exists in, say, the Faculty Reserve or Personal pool should still show up as a known
 *  model here. Consolidates what PersonalGearEditor.tsx, FacultyReserveEditor.tsx, and
 *  SetupGearLocker.tsx each used to fetch and derive manufacturer suggestions from separately. */
export function useGearCatalogueSuggestions(): GearCatalogueSuggestions {
  const [mics, setMics] = useState<Mic[]>([])
  const [outboard, setOutboard] = useState<OutboardGear[]>([])

  useEffect(() => {
    window.api.mics.listAll().then(setMics)
    window.api.outboard.listAll().then(setOutboard)
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
