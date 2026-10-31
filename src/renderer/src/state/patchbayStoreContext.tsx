import { createContext, useContext, type ReactNode } from 'react'
import { usePatchbayStore } from './patchbayStore'

/** Mirrors layoutStoreContext.tsx: the context carries the store hook itself, defaulting to the
 *  app-wide instance, so Split View's second pane can swap in its own. */
type PatchbayStoreHook = typeof usePatchbayStore

const PatchbayStoreContext = createContext<PatchbayStoreHook>(usePatchbayStore)

export function usePatchbayStoreApi(): PatchbayStoreHook {
  return useContext(PatchbayStoreContext)
}

export function usePatchbayStoreState<T>(selector: (state: ReturnType<PatchbayStoreHook['getState']>) => T): T {
  return usePatchbayStoreApi()(selector)
}

export function PatchbayStoreProvider({
  store,
  children
}: {
  store: PatchbayStoreHook
  children: ReactNode
}): JSX.Element {
  return <PatchbayStoreContext.Provider value={store}>{children}</PatchbayStoreContext.Provider>
}
