import {useSyncExternalStore} from "react";

let holders = 0;
const listeners = new Set<() => void>();

const notify = () => {
  for (const l of Array.from(listeners)) {
    l();
  }
};

export const lockPlayerControl = (): (() => void) => {
  holders++;
  if (holders === 1) {
    notify();
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    holders--;
    if (holders === 0) {
      notify();
    }
  };
};

export const isPlayerControlLocked = (): boolean => holders > 0;

export const subscribePlayerControl = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const usePlayerControlLocked = (): boolean =>
  useSyncExternalStore(subscribePlayerControl, isPlayerControlLocked);
