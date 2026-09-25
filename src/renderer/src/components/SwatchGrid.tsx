import { COLOR_SWATCHES } from '@shared/constants/swatches'

interface Props {
  value: string | null
  onSelect: (color: string | null) => void
  /** Show a "None" cell that selects `null` — used where a color is optional (e.g. row tint). */
  allowNone?: boolean
  /** Text on that null button. Defaults to "No color"; the block text-color picker calls it
   *  "Auto", because there null is a behavior rather than an absence. */
  noneLabel?: string
  /** Swatches offered in a row of their own ABOVE the grid — for choices the fixed palette doesn't
   *  have, like the plain white and black text colors. */
  extraSwatches?: { hex: string; name: string }[]
}

/** The fixed palette laid out as a grid: one column per hue, five shade rows (lightest / light /
 *  base / dark / darkest). The currently-selected swatch gets a ring. Presentational only — the
 *  caller owns any popover/positioning. */
export default function SwatchGrid({
  value,
  onSelect,
  allowNone,
  noneLabel = 'No color',
  extraSwatches
}: Props): JSX.Element {
  const shadeRows: Array<keyof (typeof COLOR_SWATCHES)[number]> = ['lightest', 'light', 'base', 'dark', 'darkest']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {extraSwatches && extraSwatches.length > 0 && (
        <div style={{ display: 'flex', gap: 4 }}>
          {extraSwatches.map((swatch) => (
            <SwatchButton
              key={swatch.hex}
              hex={swatch.hex}
              name={swatch.name}
              selected={value?.toLowerCase() === swatch.hex.toLowerCase()}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
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
            return (
              <SwatchButton
                key={`${group.name}-${shade}`}
                hex={hex}
                name={`${group.name} ${shade}`}
                selected={value?.toLowerCase() === hex.toLowerCase()}
                onSelect={onSelect}
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
          {noneLabel}
        </button>
      )}
    </div>
  )
}

function SwatchButton({
  hex,
  name,
  selected,
  onSelect
}: {
  hex: string
  name: string
  selected: boolean
  onSelect: (color: string) => void
}): JSX.Element {
  return (
    <button
      type="button"
      title={name}
      aria-label={name}
      onClick={() => onSelect(hex)}
      style={{
        width: 20,
        height: 20,
        padding: 0,
        borderRadius: 'var(--radius)',
        background: hex,
        border: '1px solid var(--color-border)',
        // An offset ring (gap in --color-bg, then accent) reads on every swatch color,
        // including ones close to --color-text where a plain border would blend in.
        boxShadow: selected ? '0 0 0 1px var(--color-bg), 0 0 0 3px var(--color-accent)' : undefined,
        cursor: 'pointer'
      }}
    />
  )
}
