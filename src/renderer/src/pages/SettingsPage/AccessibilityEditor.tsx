import { useA11yPrefsStore } from '@renderer/state/a11yPrefsStore'
import { CONTRAST_PREFERENCES, UI_SCALES, type ContrastPreference } from '@shared/constants/accessibility'
import { formatCombo } from '@shared/constants/keybindActions'

/** Settings → Accessibility.
 *
 *  The button-group markup follows the Theme and Home Layout pickers, with one addition: the group
 *  is a real `role="group"` labelled by its own heading. A bare <label> before a row of buttons
 *  labels nothing — there is no single input for it to point at — so a screen reader would announce
 *  three unexplained buttons. That matters more here than anywhere else in Settings. */
export default function AccessibilityEditor(): JSX.Element {
  const contrast = useA11yPrefsStore((s) => s.contrast)
  const setContrast = useA11yPrefsStore((s) => s.setContrast)
  const uiScale = useA11yPrefsStore((s) => s.uiScale)
  const setUiScale = useA11yPrefsStore((s) => s.setUiScale)

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <label htmlFor="ui-scale" style={{ display: 'block', marginBottom: 4 }}>
          Interface size
        </label>
        <select
          id="ui-scale"
          value={String(uiScale)}
          onChange={(e) => setUiScale(Number(e.target.value))}
          style={{ width: 260 }}
        >
          {UI_SCALES.map((s) => (
            <option key={s.factor} value={String(s.factor)}>
              {s.label}
            </option>
          ))}
        </select>
        <p className="card-sub" style={{ marginTop: 4 }}>
          Scales everything — text, controls, the setup sheet and the room layout — in this window
          and the pop-out Layout window. Also on View → Zoom In / Zoom Out, or{' '}
          {formatCombo('CmdOrCtrl+=')} and {formatCombo('CmdOrCtrl+-')}. Layout Mode&apos;s own zoom
          is a separate control, on {formatCombo('CmdOrCtrl+Shift+=')} and{' '}
          {formatCombo('CmdOrCtrl+Shift+-')}.
        </p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div id="contrast-label" style={{ marginBottom: 6 }}>
          Border contrast
        </div>
        <div className="inline-form" style={{ marginTop: 0 }} role="group" aria-labelledby="contrast-label">
          {CONTRAST_PREFERENCES.map((c) => (
            <button
              key={c.id}
              className={contrast === c.id ? 'btn primary' : 'btn'}
              aria-pressed={contrast === c.id}
              onClick={() => setContrast(c.id as ContrastPreference)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="card-sub" style={{ marginTop: 4 }}>
          {CONTRAST_PREFERENCES.find((c) => c.id === contrast)?.description}
        </p>
        <p className="card-sub" style={{ marginTop: 4 }}>
          Affects the lines around table cells, panels and controls — not text, which already meets
          the contrast standard in both themes. Most noticeable on a long setup sheet, where the
          cell grid is what tells the columns apart.
        </p>
      </div>
    </div>
  )
}
