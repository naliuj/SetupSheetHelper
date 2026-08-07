import { createContext, useContext, type ReactNode } from 'react'
import { useSetupStore } from './setupStore'

/** A Zustand store hook doubles as its own API (`hook(selector)`, `hook.getState()`,
 *  `hook.setState()`, and — via zundo — `hook.temporal`), so the context's value can just be
 *  "the store hook itself." That one type covers every call-site pattern in the codebase with
 *  a near-mechanical swap: `useSetupStore(selector)` becomes `useSetupStoreState(selector)`,
 *  and `useSetupStore.getState()`/`.setState()`/`.temporal` become
 *  `useSetupStoreApi().getState()`/`.setState()`/`.temporal`. */
type SetupStoreHook = typeof useSetupStore

/** Defaults to the app-wide singleton, so any component that doesn't sit under a
 *  SetupStoreProvider (i.e. everything outside Split View) resolves to exactly what it always
 *  did — this refactor is behavior-neutral for normal single-setup use. Split View's second
 *  pane wraps its subtree in a Provider bound to its own createSetupStore() instance instead. */
const SetupStoreContext = createContext<SetupStoreHook>(useSetupStore)

export function useSetupStoreApi(): SetupStoreHook {
  return useContext(SetupStoreContext)
}

/** The replacement for `useSetupStore(selector)` — resolves to whichever instance this
 *  component's subtree is scoped to (the singleton by default, or a pane's own instance under
 *  a SetupStoreProvider), then subscribes to it exactly like calling the hook directly would. */
export function useSetupStoreState<T>(selector: (state: ReturnType<SetupStoreHook['getState']>) => T): T {
  const storeHook = useSetupStoreApi()
  return storeHook(selector)
}

export function SetupStoreProvider({
  store,
  children
}: {
  store: SetupStoreHook
  children: ReactNode
}): JSX.Element {
  return <SetupStoreContext.Provider value={store}>{children}</SetupStoreContext.Provider>
}
