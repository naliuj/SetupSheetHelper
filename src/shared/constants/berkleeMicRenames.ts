/** Retired mic spellings, old → current, and the matching key built on them.
 *
 *  Two lists:
 *   - BERKLEE_MIC_RENAMES (and the manufacturer map): every spelling change made to a Berklee seed
 *     mic. Migration 043 APPLIES these to seeded lockers; berkleeSeedData.json already carries the
 *     current spellings for fresh seeds. FROZEN — see below.
 *   - MIC_SPELLING_ALIASES: spellings that are only ever MATCHED, never applied to anyone's data.
 *  canonicalMicKey reads both, so anything that matches a mic BY NAME treats old and new spellings
 *  as the same mic.
 *
 *  That last use is why this exists. Saved setups point at mics by id, so a rename is invisible
 *  to them. But channel presets and setup-file import store a mic as name + manufacturer text,
 *  and match it against the target studio's gear. After a rename, a preset saved as "VMA Tube
 *  Microphone" would stop finding "VMA Tube", and an older setup file would import the mic as
 *  unlinked text. Rewriting the stored presets would be the wrong fix: a user's own custom studio
 *  may still say "AT-4050", and the preset must keep matching that too. So the matchers accept
 *  either spelling instead.
 *
 *  WHY THE FIRST LIST IS FROZEN: migration 043 shipped in 1.18.0 and reads BERKLEE_MIC_RENAMES,
 *  BERKLEE_MIC_MANUFACTURER_RENAMES and canonicalMicManufacturer at run time, not a copy. An entry
 *  added to any of them changes what 043 does on an install that hasn't upgraded yet, while every
 *  1.18.0 install keeps what 043 did then — the two would quietly disagree about the same Berklee
 *  locker. Never edit them. A new spelling to match goes in MIC_SPELLING_ALIASES; a new spelling to
 *  APPLY needs a new migration with its own copy of the list.
 *
 *  CURATED PAIRS ONLY — never a general normalizer. Migration 038's warning stands: near-identical
 *  names are often different products (U 87 vs U 87 Ai, C451 vs C451 EB vs C451B), so each entry
 *  here is one specific, verified same-model pair. Entries are keyed on the CURRENT manufacturer
 *  spelling; manufacturer renames are applied first. */

export interface MicRename {
  /** Manufacturer as it is spelled NOW (after BERKLEE_MIC_MANUFACTURER_RENAMES). */
  manufacturer: string
  from: string
  to: string
}

/** Manufacturer spelling fixes, exact old value → current. FROZEN — read by migration 043. */
export const BERKLEE_MIC_MANUFACTURER_RENAMES: Record<string, string> = {
  // The brand writes itself with a hyphen.
  'Audio Technica': 'Audio-Technica'
}

/** FROZEN — applied by migration 043. Add new spellings to MIC_SPELLING_ALIASES instead. */
export const BERKLEE_MIC_RENAMES: MicRename[] = [
  // --- 2026-09 naming audit (migration 043) -----------------------------------------------------
  // The same mic entered with a word tacked on in one room — the "CMC6 MK4 Cardioid" class.
  { manufacturer: 'Avalon', from: 'U5 DI', to: 'U5' },
  { manufacturer: 'Brauner', from: 'VMA Tube Microphone', to: 'VMA Tube' },
  { manufacturer: 'Radial', from: 'JDI Passive DI Box', to: 'JDI Passive' },
  // "/CM5" is the AT4050's original kit designation, not a different mic.
  { manufacturer: 'Audio-Technica', from: 'AT4050/CM5', to: 'AT4050' },
  // Studio E's bare "013" is the 013 FET the other five rooms list (confirmed by Julian).
  { manufacturer: 'Soyuz', from: '013', to: '013 FET' },

  // One model family spelled two ways within a manufacturer, converged on the maker's spelling.
  { manufacturer: 'Audio-Technica', from: 'AT-3032', to: 'AT3032' },
  { manufacturer: 'Audio-Technica', from: 'AT-4040', to: 'AT4040' },
  { manufacturer: 'Audio-Technica', from: 'AT-4050', to: 'AT4050' },
  { manufacturer: 'Audio-Technica', from: 'ATM-87R', to: 'ATM87R' },
  { manufacturer: 'Audio-Technica', from: 'ATM-89R', to: 'ATM89R' },
  { manufacturer: 'Shure', from: 'KSM-32', to: 'KSM32' },
  { manufacturer: 'Neumann', from: 'KM184', to: 'KM 184' },
  { manufacturer: 'Neumann', from: 'U47 FET', to: 'U 47 FET' },
  { manufacturer: 'Neumann', from: 'U87 Ai', to: 'U 87 Ai' },
  { manufacturer: 'Neumann', from: 'U89', to: 'U 89' },
  { manufacturer: 'Neumann', from: 'M-149 Tube', to: 'M 149 Tube' },
  { manufacturer: 'Sennheiser', from: 'MKH40', to: 'MKH 40' },
  { manufacturer: 'Earthworks', from: 'TC-30k', to: 'TC30K' },

  // Corrections from Julian: neither old name is a real product.
  { manufacturer: 'Peluso', from: 'CMC-6', to: 'CEMC 6' },
  { manufacturer: 'Shure', from: 'Beta-92A', to: 'Beta 91A' },

  // --- Earlier fixes, kept so older presets and setup files still match ------------------------
  // Migration 041.
  { manufacturer: 'Schoeps', from: 'CMC6 MK4 Cardioid', to: 'CMC6 Mk4' },
  // Migration 038 (mics only; case-only fixes like "U87 AI" need no entry).
  { manufacturer: 'Shure', from: 'KSM-27', to: 'KSM27' },
  { manufacturer: 'Audio-Technica', from: 'AT-M87R', to: 'ATM87R' },
  { manufacturer: 'Soyuz', from: '0131 FET', to: '013 FET' }
]

/** Spellings that are matched but never applied: old names that live on in presets, setup files
 *  and other people's studios. Safe to extend — nothing but canonicalMicKey reads this. */
export const MIC_SPELLING_ALIASES: MicRename[] = [
  // The Record Co's three studio packs on the Studio Downloads site, standardized 2026-09-27 to the
  // Berklee standard. Anyone who imported a pack before then has these spellings in a custom
  // studio, and their presets and setup files still need to match the republished rooms.
  { manufacturer: 'Audio-Technica', from: 'AT-2020', to: 'AT2020' },
  { manufacturer: 'Audio-Technica', from: 'AT-2021', to: 'AT2021' },
  { manufacturer: 'Audio-Technica', from: 'AT-2050', to: 'AT2050' },
  { manufacturer: 'Audio-Technica', from: 'AT-4047', to: 'AT4047' },
  { manufacturer: 'Audio-Technica', from: 'AT-4049', to: 'AT4049' },
  { manufacturer: 'Audio-Technica', from: 'AT-4053b', to: 'AT4053b' },
  { manufacturer: 'Audio-Technica', from: 'AT-4081', to: 'AT4081' },
  // Also makes Berklee's own "D-112" (left alone: its family is consistent) match the Record Co's
  // "D112" — the same AKG kick mic, in AKG's own spelling.
  { manufacturer: 'AKG', from: 'D-112', to: 'D112' }
]

const MANUFACTURER_BY_OLD = new Map(
  Object.entries(BERKLEE_MIC_MANUFACTURER_RENAMES).map(([from, to]) => [from.toLowerCase(), to.toLowerCase()])
)
const NAME_BY_OLD = new Map(
  [...BERKLEE_MIC_RENAMES, ...MIC_SPELLING_ALIASES].map((r) => [
    `${r.manufacturer.toLowerCase()}|${r.from.toLowerCase()}`,
    r.to.toLowerCase()
  ])
)

/** A manufacturer trimmed and lowercased, with a retired spelling mapped onto its current one.
 *  FROZEN BEHAVIOR — migration 043 calls this, so it must only ever read the frozen map. */
export function canonicalMicManufacturer(manufacturer: string | null | undefined): string {
  const raw = (manufacturer ?? '').trim().toLowerCase()
  return MANUFACTURER_BY_OLD.get(raw) ?? raw
}

/** A mic's identity for matching by name: trimmed and lowercased (the rule the name matchers
 *  have always used), with any retired spelling — from either list — mapped onto its current one. Two mics
 *  with equal keys are the same mic. Deliberately does NOT collapse inner whitespace or strip
 *  punctuation — beyond the curated pairs above, matching behaves exactly as it did before. */
export function canonicalMicKey(manufacturer: string | null | undefined, name: string): string {
  const m = canonicalMicManufacturer(manufacturer)
  const rawName = name.trim().toLowerCase()
  const n = NAME_BY_OLD.get(`${m}|${rawName}`) ?? rawName
  return `${m}|${n}`
}
