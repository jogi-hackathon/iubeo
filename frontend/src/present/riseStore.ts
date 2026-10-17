import {useSyncExternalStore} from "react";

export type RiseState = {startedAt: number} | null;

export const createRiseStore = () => {
  let state: RiseState = null;
  let release: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const set = (next: RiseState) => {
    state = next;
    for (const l of Array.from(listeners)) {
      l();
    }
  };

  return {
    getState: (): RiseState => state,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    start: (startedAt: number, onFinish: () => void) => {
      release?.();
      release = onFinish;
      set({startedAt});
    },
    finish: () => {
      const done = release;
      release = null;
      done?.();
      if (state !== null) {
        set(null);
      }
    },
  };
};

export const riseStore = createRiseStore();

export const useRising = (): boolean =>
  useSyncExternalStore(riseStore.subscribe, riseStore.getState) !== null;
