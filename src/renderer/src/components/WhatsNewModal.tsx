import { useWhatsNewStore } from '@renderer/state/whatsNewStore'
import { useEscapeToClose } from '@renderer/hooks/useEscapeToClose'

/** Shown automatically after a real version upgrade (see whatsNewStore.load()), and reachable
 *  anytime via the "What's New…" app-menu item (or the hidden Cmd+Shift+Option+W debug keybind).
 *  Unlike BerkleeOnboardingModal, this is purely informational — Escape and backdrop-click both
 *  dismiss it, same as every other non-forced modal in the app. */
export default function WhatsNewModal(): JSX.Element {
  const entries = useWhatsNewStore((s) => s.entries)
  const close = useWhatsNewStore((s) => s.close)
  useEscapeToClose(close)

  const newestFirst = [...entries].reverse()

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480, maxHeight: '80vh', overflowY: 'auto' }}>
        <h2 style={{ marginTop: 0 }}>What&rsquo;s new</h2>
        {newestFirst.map((entry) => (
          <div key={entry.version} style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 4 }}>
              v{entry.version}
              {entry.date && (
                <span className="card-sub" style={{ fontWeight: 400 }}>
                  {' '}
                  — {entry.date}
                </span>
              )}
            </h3>
            <ul style={{ marginTop: 0 }}>
              {entry.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn primary" onClick={close}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
