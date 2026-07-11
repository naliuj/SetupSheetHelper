import type Database from 'better-sqlite3'

/** Re-map the built-in palette items' default colors onto the fixed swatch palette (COLOR_SWATCHES),
 *  so the seeded defaults line up exactly with what the color picker offers. Migration 012 seeded
 *  these rows from INSTRUMENT_TYPES with free-form hexes; this rewrites each old default to its
 *  nearest swatch.
 *
 *  Scoped to `is_builtin = 1 AND color = <old hex>` so it only touches built-ins a user hasn't
 *  recolored — an item already customized (to any other value) keeps its color. INSTRUMENT_TYPES
 *  itself is updated in lockstep, so fresh installs seed the new values directly and this migration
 *  is a no-op for them. */
const COLOR_REMAP: Array<{ from: string; to: string }> = [
  { from: '#e6738f', to: '#f87171' }, // Vocals      -> Red · light
  { from: '#4f7cac', to: '#64748b' }, // Drums       -> Slate · base
  { from: '#f2a541', to: '#f59e0b' }, // Amps        -> Amber · base
  { from: '#8a6fbf', to: '#a855f7' }, // Keys        -> Purple · base
  { from: '#5fb49c', to: '#14b8a6' }, // Utility/DI  -> Teal · base
  { from: '#d98c3f', to: '#fb923c' }, // Horns       -> Orange · light
  { from: '#7a9e5f', to: '#22c55e' } // Strings     -> Green · base
]

export function run(db: Database.Database): void {
  const update = db.prepare('UPDATE palette_items SET color = @to WHERE is_builtin = 1 AND color = @from')
  const remap = db.transaction(() => {
    COLOR_REMAP.forEach(({ from, to }) => update.run({ from, to }))
  })
  remap()
}
