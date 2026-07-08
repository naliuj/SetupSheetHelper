// Longest-prefix-match first so multi-word/hyphenated manufacturers (e.g. "Electro-Voice")
// are matched before any shorter conflicting single-word prefix. Sorted by length at load
// time so authoring order in this list never matters.
const RAW_MANUFACTURER_PREFIXES: string[] = [
  'Electro-Voice',
  'Universal Audio',
  'Audio Technica',
  'Beyerdynamic',
  'Tube-Tech',
  'Studio Technologies',
  'Chandler Limited',
  'Chandler',
  'Tech21',
  'Tech 21',
  'Empirical Labs',
  'TC Electronic',
  'True Systems',
  'TRUE Systems',
  'Summit Audio',
  'Summit',
  'Undertone Audio',
  'Groove Tubes',
  'Crane Song',
  'Millennia Media',
  'Crowley and Tripp',
  'B&K',
  'DPA',
  'AEA',
  'Coles',
  'Schoeps',
  'Sanken',
  'Royer',
  'Brauner',
  'Countryman',
  'Crown',
  'Earthworks',
  'Jensen',
  'Soyuz',
  'Bricasti',
  'Avalon',
  'Kerwax',
  'AKG',
  'Shure',
  'Neumann',
  'Sennheiser',
  'Audix',
  'API',
  'Neve',
  'Lexicon',
  'Lexion',
  'Drawmer',
  'Eventide',
  'Pultec',
  'UREI',
  'MXL',
  'Sony',
  'Yamaha',
  'Roland',
  'Rode',
  'ADK',
  'GML',
  'DBX',
  'SSL',
  'Warm',
  'Radial'
]

export const MANUFACTURER_PREFIXES = [...RAW_MANUFACTURER_PREFIXES].sort((a, b) => b.length - a.length)

export function guessManufacturer(name: string): string | null {
  const normalized = name.trim().toLowerCase()
  for (const prefix of MANUFACTURER_PREFIXES) {
    if (normalized.startsWith(prefix.toLowerCase())) return prefix
  }
  return null
}
