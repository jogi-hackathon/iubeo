import {useSyncExternalStore} from "react";

export interface CoverBar {
  total: number;
  done: number;
  since: number;
}

export interface CoverState {
  covered: boolean;
  bar: CoverBar | null;
  booting: boolean;
  consented: boolean;
}

let state: CoverState = {
  covered: true,
  bar: null,
  booting: true,
  consented: false,
};
const listeners = new Set<() => void>();

const set = (next: CoverState) => {
  state = next;
  for (const l of Array.from(listeners)) {
    l();
  }
};

export const coverStore = {
  getState: (): CoverState => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  setCovered: (covered: boolean): void => {
    if (covered === state.covered) {
      return;
    }
    set({...state, covered, bar: covered ? null : state.bar});
  },
  finishBoot: (): void => {
    if (state.booting) {
      set({...state, booting: false});
    }
  },
  setBooting: (booting: boolean): void => {
    if (booting !== state.booting) {
      set({...state, booting});
    }
  },
  setBar: (total: number, done: number): void => {
    const bar = state.bar;
    if (bar && bar.total === total && bar.done === done) {
      return;
    }
    set({...state, bar: {total, done, since: performance.now()}});
  },
  hideBar: (): void => {
    if (state.bar !== null) {
      set({...state, bar: null});
    }
  },
  setConsented: (consented: boolean): void => {
    if (consented !== state.consented) {
      set({...state, consented});
    }
  },
  waitForConsent: (): Promise<void> =>
    state.consented
      ? Promise.resolve()
      : new Promise((resolve) => {
          const unsubscribe = coverStore.subscribe(() => {
            if (state.consented) {
              unsubscribe();
              resolve();
            }
          });
        }),
};

export const useCoverState = (): CoverState =>
  useSyncExternalStore(coverStore.subscribe, coverStore.getState);
