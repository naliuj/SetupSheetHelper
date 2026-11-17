/** Today's date as YYYY-MM-DD in the user's own time zone. toISOString() is UTC, so in the
 *  evening (west of Greenwich) it already gave tomorrow's date. */
export function localDateString(d = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
