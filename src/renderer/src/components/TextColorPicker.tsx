import { AlertTriangle } from 'lucide-react'
import { contrastRatio, isHexColor, LABEL_TEXT_SWATCHES } from '@shared/constants/swatches'
import SwatchPicker from './SwatchPicker'

/** WCAG AA for normal-size text. Block labels are drawn small and over a busy floor plan, so this
 *  is the right bar rather than the 3:1 large-text one. */
const AA_NORMAL_TEXT = 4.5

interface Props {
  /** A hex, or null for Auto. */
  value: string | null
  onChange: (color: string | null) => void
  title?: string
  /** The fill this text will be drawn on. Supply it to get the contrast warning — without it the
   *  picker cannot know whether the pick is legible. Auto never warns: it picks the better of
   *  black and white for the fill by construction. */
  fill?: string | null
}

/** The Layout Mode block text-color picker: Auto, then plain white and black, then the swatch grid.
 *  null is Auto — the label keeps choosing black or white from its fill — so it is offered as a
 *  first-class choice rather than as "no color".
 *
 *  An explicit pick is honored unconditionally by resolveLabelColor, which is the point of having
 *  it, but nothing used to say when that pick was unreadable: white on light amber is 1.1:1 and
 *  looked fine in the picker, where the swatch sits on the app's own background rather than on the
 *  block. The warning states the ratio rather than just flagging a problem, so the difference
 *  between "slightly under" and "invisible" is visible, and pairs an icon with text so it does not
 *  depend on color to be noticed. */
export default function TextColorPicker({ value, onChange, title = 'Text color', fill }: Props): JSX.Element {
  const ratio = isHexColor(value) && isHexColor(fill) ? contrastRatio(value, fill) : null
  const failing = ratio != null && ratio < AA_NORMAL_TEXT

  return (
    <>
      <SwatchPicker
        value={value}
        onChange={onChange}
        allowNone
        noneLabel="Auto"
        emptyLabel="Auto"
        extraSwatches={LABEL_TEXT_SWATCHES}
        title={title}
      />
      {failing && (
        <span
          className="warning-badge inline-icon-text"
          title={`This text color is ${ratio.toFixed(1)}:1 against the block fill — below the ${AA_NORMAL_TEXT}:1 needed to stay readable. Auto always picks a readable one.`}
        >
          <AlertTriangle size={12} aria-hidden="true" />
          {ratio.toFixed(1)}:1
        </span>
      )}
    </>
  )
}
