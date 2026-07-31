/** Trim, lowercase, and collapse internal whitespace runs — the rule for "these two rows in
 *  different setups are the same source".
 *
 *  Shared between main and renderer deliberately: the Compare grid groups its rows by this key AND
 *  alignMultiSetupRow resolves its write targets by it, so two definitions would mean the row you
 *  clicked isn't the row that got written.
 *
 *  Deliberately no fuzzier than this. "Kick" and "Kick In" are different sources, and silently
 *  merging them is worse than showing two rows — genuinely different names that mean the same
 *  thing ("Gtr 1" / "Guitar 1") read as a rename in Compare, which costs no changeover time. */
export function normalizeSourceName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}
