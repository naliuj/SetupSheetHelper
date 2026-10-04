/** SQLite's datetime('now') is UTC written without a zone ("2026-09-29 18:04:11"), which a
 *  browser reads as local time — so a label built from it showed UTC. Mark it as UTC before
 *  parsing so it displays in the user's own time zone. */
export function parseDbTimestamp(value: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`)
}
