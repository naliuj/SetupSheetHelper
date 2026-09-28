import { useToastStore } from '@renderer/state/toastStore'

/** Bottom-center notification for the current toast, if any — see toastStore for lifecycle.
 *  Mounted once in SetupEditor alongside the toolbar.
 *
 *  The live region is a separate, always-mounted element rather than `role="status"` on the toast
 *  itself, for two reasons. A live region has to already be in the accessibility tree when its
 *  contents change — one that appears at the same moment as its text is routinely missed — and
 *  this component returns null whenever there is no toast, so the visible element cannot be it.
 *  Keeping them separate also means the visible toast is not announced twice.
 *
 *  It mentions Undo because otherwise the availability of a time-limited action is conveyed only
 *  by a button appearing on screen. */
export default function Toast(): JSX.Element {
  const message = useToastStore((s) => s.message)
  const onUndo = useToastStore((s) => s.onUndo)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <>
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {message ? `${message.replace(/\.$/, '')}${onUndo ? '. Undo available.' : '.'}` : ''}
      </div>
      {message && (
        <div className="toast">
          <span>{message}</span>
          {onUndo && (
            <button
              className="toast-undo"
              onClick={() => {
                onUndo()
                dismiss()
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </>
  )
}
