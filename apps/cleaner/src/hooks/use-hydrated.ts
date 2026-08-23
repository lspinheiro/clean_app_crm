"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * False for the server snapshot and first hydration pass, then true in the browser.
 * This keeps native form submission disabled until React owns the submit handler.
 */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
