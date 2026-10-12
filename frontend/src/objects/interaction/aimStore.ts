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

/** id の物だけを見る。ほかの物の照準が動いても再描画されない */
export const useIsAimed = (id: string): boolean =>
  useSyncExternalStore(subscribe, () => aimed === id);
