import { createContext, useContext, type ReactNode } from 'react'
import { useCatalogStore } from './catalogStore'

/** Same "the store hook doubles as its own API" pattern as setupStoreContext.tsx — see that
 *  file's doc comment for the full rationale. */
type CatalogStoreHook = typeof useCatalogStore

/** Defaults to the app-wide singleton, so any component that doesn't sit under a
 *  CatalogStoreProvider (i.e. everything outside Split View) resolves to exactly what it always
 *  did. Split View's second pane wraps its subtree in a Provider bound to its own
 *  createCatalogStore() instance instead — see SplitSetupView.tsx. */
const CatalogStoreContext = createContext<CatalogStoreHook>(useCatalogStore)

export function useCatalogStoreApi(): CatalogStoreHook {
  return useContext(CatalogStoreContext)
}

/** The replacement for `useCatalogStore(selector)` — resolves to whichever instance this
 *  component's subtree is scoped to (the singleton by default, or a pane's own instance under
 *  a CatalogStoreProvider), then subscribes to it exactly like calling the hook directly would. */
export function useCatalogStoreState<T>(selector: (state: ReturnType<CatalogStoreHook['getState']>) => T): T {
  const storeHook = useCatalogStoreApi()
  return storeHook(selector)
}

export function CatalogStoreProvider({
  store,
  children
}: {
  store: CatalogStoreHook
  children: ReactNode
}): JSX.Element {
  return <CatalogStoreContext.Provider value={store}>{children}</CatalogStoreContext.Provider>
}
