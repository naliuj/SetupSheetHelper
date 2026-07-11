import { COLOR_SWATCHES } from '@shared/constants/swatches'

interface Props {
  value: string | null
  onSelect: (color: string | null) => void
  /** Show a "None" cell that selects `null` — used where a color is optional (e.g. row tint). */
  allowNone?: boolean
}

/** The fixed palette laid out as a grid: one column per hue, five shade rows (lightest / light /
 *  base / dark / darkest). The currently-selected swatch gets a ring. Presentational only — the
 *  caller owns any popover/positioning. */
export default function SwatchGrid({ value, onSelect, allowNone }: Props): JSX.Element {
  const shadeRows: Array<keyof (typeof COLOR_SWATCHES)[number]> = ['lightest', 'light', 'base', 'dark', 'darkest']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLOR_SWATCHES.length}, 20px)`,
          gap: 4
        }}
      >
        {shadeRows.map((shade) =>
          COLOR_SWATCHES.map((group) => {
            const hex = group[shade] as string
            const selected = value?.toLowerCase() === hex.toLowerCase()
            return (
              <button
                key={`${group.name}-${shade}`}
                type="button"
                title={`${group.name} ${shade}`}
                aria-label={`${group.name} ${shade}`}
                onClick={() => onSelect(hex)}
                style={{
                  width: 20,
                  height: 20,
                  padding: 0,
                  borderRadius: 'var(--radius)',
                  background: hex,
                  border: selected ? '2px solid var(--color-text)' : '1px solid var(--color-border)',
                  cursor: 'pointer'
                }}
              />
            )
          })
        )}
      </div>
      {allowNone && (
        <button
          type="button"
          className="btn small"
          onClick={() => onSelect(null)}
          style={{ width: '100%', fontWeight: value == null ? 600 : undefined }}
        >
          No color
        </button>
      )}
    </div>
  )
}
