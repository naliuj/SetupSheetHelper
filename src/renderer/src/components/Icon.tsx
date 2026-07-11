import type { CSSProperties } from 'react'

/** Small in-app icon set — inline stroke SVGs (24×24, Tabler's MIT-licensed paths). The app had
 *  no icon system before this (only unicode glyphs); add a glyph to ICON_PATHS to extend it. */
export type IconName =
  | 'plus'
  | 'minus'
  | 'columns'
  | 'bookmark'
  | 'chevron-down'
  | 'list-numbers'
  | 'trash'
  | 'x'

const ICON_PATHS: Record<IconName, string[]> = {
  plus: ['M12 5l0 14', 'M5 12l14 0'],
  minus: ['M5 12l14 0'],
  columns: ['M4 4m0 1a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1z', 'M12 4l0 16'],
  bookmark: ['M9 4h6a2 2 0 0 1 2 2v14l-5 -3l-5 3v-14a2 2 0 0 1 2 -2'],
  'chevron-down': ['M6 9l6 6l6 -6'],
  'list-numbers': [
    'M11 6h9',
    'M11 12h9',
    'M12 18h8',
    'M4 16a2 2 0 1 1 4 0c0 .591 -.601 1.46 -1 2l-3 3h4',
    'M6 10v-6l-2 2'
  ],
  trash: [
    'M4 7l16 0',
    'M10 11l0 6',
    'M14 11l0 6',
    'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12',
    'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3'
  ],
  x: ['M18 6l-12 12', 'M6 6l12 12']
}

interface IconProps {
  name: IconName
  /** Pixel size of the square glyph. Defaults to 16. */
  size?: number
  className?: string
  style?: CSSProperties
  /** Provide for icon-only interactive elements; otherwise the icon is decorative (aria-hidden). */
  'aria-label'?: string
}

export default function Icon({ name, size = 16, className, style, 'aria-label': ariaLabel }: IconProps): JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
