import {useSyncExternalStore} from "react";

let aimed: string | null = null;
const listeners = new Set<() => void>();

export const getAimedObjectId = (): string | null => aimed;

export const setAimedObjectId = (id: string | null): void => {
  if (aimed === id) {
    return;
  }
  aimed = id;
  for (const l of Array.from(listeners)) {
    l();
  }
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useAimedObjectId = (): string | null =>
  useSyncExternalStore(subscribe, getAimedObjectId);

export const useIsAimed = (id: string): boolean =>
  useSyncExternalStore(subscribe, () => aimed === id);
