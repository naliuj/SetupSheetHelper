/** The three kinds of trackpad feedback macOS offers (NSHapticFeedbackPattern), named as Apple does.
 *
 *  - alignment: something snapped into line — a block onto a guide, a rotation onto 90°.
 *  - levelChange: a discrete step — a zoom detent, hitting a limit.
 *  - generic: anything else, e.g. a reordered row passing a slot. */
export type HapticPattern = 'generic' | 'alignment' | 'levelChange'

export const HAPTIC_PATTERNS: readonly HapticPattern[] = ['generic', 'alignment', 'levelChange']

export function isHapticPattern(value: unknown): value is HapticPattern {
  return typeof value === 'string' && (HAPTIC_PATTERNS as readonly string[]).includes(value)
}
