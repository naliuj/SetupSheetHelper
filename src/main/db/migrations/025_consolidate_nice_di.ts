import type Database from 'better-sqlite3'

/** Berklee's faculty-reserve "Nice DI" (Phoenix Audio) was seeded as two separate quantity-1
 *  rows, "Nice DI (L)" and "Nice DI (R)" — really just two identical units of the same DI box.
 *  Consolidates them into a single quantity-2 "Nice DI" row (matching the corrected seed data),
 *  re-pointing any setup_items that referenced the (R) row onto the surviving (L) row first so
 *  existing channel assignments aren't lost to the mics(id) FK's ON DELETE SET NULL. Guarded by
 *  name lookups rather than hardcoded ids, so it's a no-op on any DB that never had the split rows
 *  (fresh installs already seed the consolidated form) and safely idempotent if run twice. */
export function run(db: Database.Database): void {
  const findMic = (name: string): { id: number; quantity: number } | undefined =>
    db
      .prepare(
        `SELECT id, quantity FROM mics WHERE pool_type = 'faculty_reserve' AND manufacturer = 'Phoenix Audio' AND name = ?`
      )
      .get(name) as { id: number; quantity: number } | undefined

  const left = findMic('Nice DI (L)')
  const right = findMic('Nice DI (R)')

  if (left && right) {
    db.prepare('UPDATE setup_items SET mic_id = ? WHERE mic_id = ?').run(left.id, right.id)
    db.prepare('UPDATE mics SET name = ?, quantity = ? WHERE id = ?').run(
      'Nice DI',
      left.quantity + right.quantity,
      left.id
    )
    db.prepare('DELETE FROM mics WHERE id = ?').run(right.id)
  } else if (left) {
    db.prepare('UPDATE mics SET name = ? WHERE id = ?').run('Nice DI', left.id)
  } else if (right) {
    db.prepare('UPDATE mics SET name = ? WHERE id = ?').run('Nice DI', right.id)
  }
}
