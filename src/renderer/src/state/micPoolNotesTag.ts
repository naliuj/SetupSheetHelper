import type { MicPoolType } from '@shared/types/entities'

const TAG_LABELS: Record<'building' | 'faculty_reserve' | 'personal', string> = {
  building: 'Building Office',
  faculty_reserve: 'Faculty Reserve',
  personal: 'Personal Gear Locker'
}

const TAG_PATTERN = /\s*\[(Building Office|Faculty Reserve|Personal Gear Locker)\]$/

/**
 * Keeps a row's Notes tagged with where a borrowed mic/outboard item came from. Strips any
 * previously applied tag before re-appending (or omitting) the new one, so switching gear
 * never leaves a stale tag behind or duplicates one. The tag lives at the END of the notes,
 * after anything the engineer already typed, which is never touched. Shared by mic and
 * outboard selection — both pool types are the same literal union.
 */
export function applyMicPoolNotesTag(notes: string, poolType: MicPoolType | null): string {
  const stripped = notes.replace(TAG_PATTERN, '')
  if (poolType === 'building' || poolType === 'faculty_reserve' || poolType === 'personal') {
    const tag = `[${TAG_LABELS[poolType]}]`
    return stripped ? `${stripped} ${tag}` : tag
  }
  return stripped
}
