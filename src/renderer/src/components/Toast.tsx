import { useToastStore } from '@renderer/state/toastStore'

/** Bottom-center notification for the current toast, if any — see toastStore for lifecycle.
 *  Mounted once in SetupEditor alongside the toolbar. */
export default function Toast(): JSX.Element | null {
  const message = useToastStore((s) => s.message)
  const onUndo = useToastStore((s) => s.onUndo)
  const dismiss = useToastStore((s) => s.dismiss)

  if (!message) return null

  return (
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
  )
}
