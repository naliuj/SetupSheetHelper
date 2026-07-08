import { useEffect, useRef, useState } from 'react'

/** Buffers a controlled field's value locally so keystrokes don't hit the store (and therefore
 *  autosave) until the user commits by blurring — typing no longer restarts the debounced
 *  autosave on every character. Resyncs from `value` when it changes upstream without matching
 *  what's already been committed locally (e.g. switching to a different row/setup), but not
 *  merely because of an in-progress edit. */
export function useBufferedField<T>(
  value: T,
  commit: (value: T) => void
): { value: T; onChange: (value: T) => void; onBlur: () => void } {
  const [local, setLocal] = useState(value)
  const lastKnown = useRef(value)

  useEffect(() => {
    if (value !== lastKnown.current) {
      lastKnown.current = value
      setLocal(value)
    }
  }, [value])

  function onChange(next: T): void {
    setLocal(next)
  }

  function onBlur(): void {
    if (local !== lastKnown.current) {
      lastKnown.current = local
      commit(local)
    }
  }

  return { value: local, onChange, onBlur }
}
