import type Database from 'better-sqlite3'

/** Historically seeded Berklee data unconditionally on every fresh install. Berklee data is now
 *  opt-in (see src/main/db/seedBerklee.ts, triggered from the onboarding modal / Settings
 *  toggle instead of unconditionally at migration time). This migration version is kept as a
 *  no-op stub rather than removed — schema_migrations already has version 2 recorded as applied
 *  on every existing install, so a no-op body is the correct way to retire it without disturbing
 *  version tracking. */
export function run(_db: Database.Database): void {
  // Intentionally empty — see src/main/db/seedBerklee.ts
}
