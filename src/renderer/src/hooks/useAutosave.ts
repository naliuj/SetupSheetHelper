import { useEffect, useRef } from 'react'

/** Normal debounce: a burst of edits becomes one write instead of a full replace per keystroke. */
const AUTOSAVE_DELAY_MS = 1000

/** Longest a dirty editor may go unsaved while the user keeps editing. The debounce re-arms on
 *  every change, so without a cap a continuous burst (typing, drawing) never saved until it
 *  stopped, and quitting mid-burst lost all of it. */
const AUTOSAVE_MAX_WAIT_MS = 5000

/** Wait after a failed save. Slower than the debounce: whatever is wrong is unlikely to be fixed
 *  within a second, and each attempt is several IPC round trips. */
const AUTOSAVE_RETRY_MS = 10_000

/** Debounced autosave shared by the editor pane and the pop-out Layout window, so the two can't
 *  drift apart again (the pop-out's hand copy had no retry and no max-wait).
 *
 *  `errors` are the stores' saveError values: each failure is a fresh object, so a failed attempt
 *  re-runs the effect and schedules a retry without the user touching anything. `changes` are the
 *  values whose edits should re-arm the timer. `run` is read at fire time, so it sees current
 *  state. Both arrays must keep the same length for the life of the component. */
export function useAutosave(
  dirty: boolean,
  errors: readonly unknown[],
  changes: readonly unknown[],
  run: () => void
): void {
  const dirtySinceRef = useRef<number | null>(null)
  const runRef = useRef(run)
  runRef.current = run

  useEffect(() => {
    if (!dirty) {
      dirtySinceRef.current = null
      return
    }
    if (dirtySinceRef.current == null) dirtySinceRef.current = Date.now()

    const failed = errors.some((error) => error != null)
    const elapsed = Date.now() - dirtySinceRef.current
    const delay = failed
      ? AUTOSAVE_RETRY_MS
      : Math.max(0, Math.min(AUTOSAVE_DELAY_MS, AUTOSAVE_MAX_WAIT_MS - elapsed))

    const timer = setTimeout(() => {
      // Open a fresh window before saving, so a run of failures cannot collapse the delay to 0.
      dirtySinceRef.current = Date.now()
      runRef.current()
    }, delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, ...errors, ...changes])
}
