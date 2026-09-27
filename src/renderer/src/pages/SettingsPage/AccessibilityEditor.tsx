import { useA11yPrefsStore } from '@renderer/state/a11yPrefsStore'
import { CONTRAST_PREFERENCES, type ContrastPreference } from '@shared/constants/accessibility'

/** Settings → Accessibility.
 *
 *  The button-group markup follows the Theme and Home Layout pickers, with one addition: the group
 *  is a real `role="group"` labelled by its own heading. A bare <label> before a row of buttons
 *  labels nothing — there is no single input for it to point at — so a screen reader would announce
 *  three unexplained buttons. That matters more here than anywhere else in Settings. */
export default function AccessibilityEditor(): JSX.Element {
  const contrast = useA11yPrefsStore((s) => s.contrast)
  const setContrast = useA11yPrefsStore((s) => s.setContrast)

  return (
    <div>
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
