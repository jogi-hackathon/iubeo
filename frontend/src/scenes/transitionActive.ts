import {useSyncExternalStore} from "react";

let active = false;
const listeners = new Set<() => void>();

export const setTransitionActive = (next: boolean): void => {
  if (active === next) {
    return;
  }
  active = next;
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

export const useTransitionActive = (): boolean =>
  useSyncExternalStore(subscribe, () => active);
