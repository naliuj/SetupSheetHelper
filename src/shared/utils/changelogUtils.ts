import { CHANGELOG_ENTRIES, type ChangelogEntry } from '../constants/changelog'

/** Entries strictly newer than `lastSeenVersion`, oldest→newest (same order as CHANGELOG_ENTRIES).
 *  - `lastSeenVersion` null/undefined → [] — the caller (whatsNewStore) decides what a fresh
 *    install means, this helper only answers "what's newer than X".
 *  - Found in the array → everything after that index.
 *  - Not found (e.g. a hand-edited/garbage setting value) → just the latest entry, not the whole
 *    history. An unrecognized-but-present value means a real returning user, not a fresh install,
 *    so a single-entry "what's new" is the least-surprising fallback. */
export function getNewChangelogEntries(lastSeenVersion: string | null): ChangelogEntry[] {
  if (!lastSeenVersion) return []
  const idx = CHANGELOG_ENTRIES.findIndex((e) => e.version === lastSeenVersion)
  if (idx === -1) return CHANGELOG_ENTRIES.slice(-1)
  return CHANGELOG_ENTRIES.slice(idx + 1)
}
