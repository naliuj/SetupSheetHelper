import { LABEL_TEXT_SWATCHES } from '@shared/constants/swatches'
import SwatchPicker from './SwatchPicker'

interface Props {
  /** A hex, or null for Auto. */
  value: string | null
  onChange: (color: string | null) => void
  title?: string
}

/** The Layout Mode block text-color picker: Auto, then plain white and black, then the swatch grid.
 *  null is Auto — the label keeps choosing black or white from its fill — so it is offered as a
 *  first-class choice rather than as "no color". */
export default function TextColorPicker({ value, onChange, title = 'Text color' }: Props): JSX.Element {
  return (
    <SwatchPicker
      value={value}
      onChange={onChange}
      allowNone
      noneLabel="Auto"
      emptyLabel="Auto"
      extraSwatches={LABEL_TEXT_SWATCHES}
      title={title}
    />
  )
}
