import { readableTextColor } from '@shared/constants/swatches'

/** A small live preview of a palette block — the actual shape + color + label the user will drag
 *  onto a floor plan. Shared by the block list and the Hidden list so both show WYSIWYG previews
 *  instead of a bare color swatch. */
export default function PaletteBlockChip({
  label,
  shape,
  color
}: {
  label: string
  shape: 'rect' | 'circle'
  color: string
}): JSX.Element {
  const common: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    lineHeight: 1.1,
    fontSize: 10,
    fontWeight: 700,
    color: readableTextColor(color),
    background: color,
    boxShadow: '0 1px 2px rgba(0,0,0,.3)',
    flexShrink: 0,
    overflow: 'hidden',
    padding: '3px 5px'
  }
  return shape === 'circle' ? (
    <span style={{ ...common, width: 44, height: 44, borderRadius: '50%' }}>{label}</span>
  ) : (
    <span style={{ ...common, minWidth: 52, height: 40, borderRadius: 5 }}>{label}</span>
  )
}
