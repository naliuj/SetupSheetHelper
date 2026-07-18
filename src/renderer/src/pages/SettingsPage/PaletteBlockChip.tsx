import { readableTextColor } from '@shared/constants/swatches'

// The preview box a rect chip is fit within. A plain rect (no custom default size) renders as a
// square; one with a default size (e.g. the gobo, 120x20) is scaled to that aspect ratio so it
// reads as the long thin bar it drops in as.
const RECT_BOX = 44
const RECT_MAX_W = 76

/** A small live preview of a palette block — the actual shape + (for blocks with a custom default
 *  size) proportions, color, and label the user will drag onto a floor plan. Shared by the block
 *  list and the Hidden list so both show WYSIWYG previews instead of a bare color swatch. */
export default function PaletteBlockChip({
  label,
  shape,
  color,
  defaultWidth,
  defaultHeight
}: {
  label: string
  shape: 'rect' | 'circle'
  color: string
  defaultWidth?: number | null
  defaultHeight?: number | null
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
    padding: '2px 4px'
  }

  if (shape === 'circle') {
    return <span style={{ ...common, width: RECT_BOX, height: RECT_BOX, borderRadius: '50%' }}>{label}</span>
  }

  // A rect with a custom default size mirrors that aspect ratio (scaled to fit); otherwise it's a
  // square, matching the standard square placed-block default.
  let width = RECT_BOX
  let height = RECT_BOX
  if (defaultWidth != null && defaultHeight != null && defaultWidth > 0 && defaultHeight > 0) {
    const aspect = defaultWidth / defaultHeight
    width = Math.min(RECT_MAX_W, RECT_BOX * aspect)
    height = width / aspect
    if (height > RECT_BOX) {
      height = RECT_BOX
      width = RECT_BOX * aspect
    }
  }
  return <span style={{ ...common, width, height, borderRadius: 5 }}>{label}</span>
}
