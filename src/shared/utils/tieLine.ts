/** Tie lines are free text: most are plain numbers, but some patch bays label theirs ("PB1"). */

/** What two tie lines are compared by when checking for duplicates, so "pb1 " and "PB1" clash. */
export function tieLineKey(tieLine: string): string {
  return tieLine.trim().toLowerCase()
}

/** A linked stereo pair's partner tie line: the trailing number moved by `direction`, keeping any
 *  prefix and zero-padding ("PB1" → "PB2", "09" → "10"), clamped to a minimum of 1. Null when
 *  there's no trailing number to step, since two rows can't share one tie line. */
export function offsetTieLine(tieLine: string, direction: number): string | null {
  const match = /^(.*?)(\d+)$/.exec(tieLine.trim())
  if (!match) return null
  const [, prefix, digits] = match
  const next = Math.max(1, Number(digits) + direction)
  return prefix + String(next).padStart(digits.length, '0')
}
