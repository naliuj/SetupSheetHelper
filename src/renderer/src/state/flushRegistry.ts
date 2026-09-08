import { useEffect } from 'react'

type Flusher = () => Promise<void> | void

/** Everything currently holding unsaved editor state.
 *
 *  There is no single store to flush at quit time: the editor's stores are context-scoped so
 *  Split View's two panes each own their own instance (see setupStoreContext). Rather than reach
 *  for those from the app root, whoever holds a store registers a flusher while it is mounted. */
const flushers = new Set<Flusher>()

export function registerFlusher(fn: Flusher): () => void {
  flushers.add(fn)
  return () => {
    flushers.delete(fn)
  }
}

/** Runs every registered flusher and resolves once they have all settled. Never rejects — a
 *  failing pane must not stop the others from saving, and at quit time there is nothing useful
 *  left to do with the error anyway. */
export async function flushAll(): Promise<void> {
  await Promise.allSettled([...flushers].map((fn) => fn()))
}

/** Registers `fn` for as long as the calling component is mounted. */
export function useFlusher(fn: Flusher): void {
  useEffect(() => registerFlusher(fn), [fn])
}

/** Answers main's before-quit flush request: save everything registered, then ack.
 *
 *  Always acks, even on failure — main waits out a full timeout otherwise, which would make the
 *  app feel like it refuses to quit. Mounted once per window. */
export function useQuitFlush(): void {
  useEffect(() => {
    return window.api.app.onFlushRequested(async (request) => {
      try {
        await flushAll()
      } finally {
        window.api.app.sendFlushAck({ requestId: request.requestId })
      }
    })
  }, [])
}
