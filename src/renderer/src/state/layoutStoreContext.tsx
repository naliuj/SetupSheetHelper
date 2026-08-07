import { createContext, useContext, type ReactNode } from 'react'
import { useLayoutStore } from './layoutStore'

/** Mirrors setupStoreContext.tsx — see that file for why the context value is "the store hook
 *  itself" rather than a plain data slice. */
type LayoutStoreHook = typeof useLayoutStore

/** Defaults to the app-wide singleton (paired to setupStore's own singleton), so any component
 *  outside Split View resolves to exactly what it always did. */
const LayoutStoreContext = createContext<LayoutStoreHook>(useLayoutStore)

export function useLayoutStoreApi(): LayoutStoreHook {
  return useContext(LayoutStoreContext)
}

/** The replacement for `useLayoutStore(selector)` — see useSetupStoreState in
 *  setupStoreContext.tsx for the equivalent explanation. */
export function useLayoutStoreState<T>(selector: (state: ReturnType<LayoutStoreHook['getState']>) => T): T {
  const storeHook = useLayoutStoreApi()
  return storeHook(selector)
}

export function LayoutStoreProvider({
  store,
  children
}: {
  store: LayoutStoreHook
  children: ReactNode
}): JSX.Element {
  return <LayoutStoreContext.Provider value={store}>{children}</LayoutStoreContext.Provider>
}
