import {createContext, useContext, useSyncExternalStore} from "react";

export type ToggleState = {
  hidden: ReadonlySet<string>;
  disabled: ReadonlySet<string>;
  highlighted: ReadonlySet<string>;
};

export type ToggleInitial = {
  hidden?: readonly string[];
  disabled?: readonly string[];
  highlighted?: readonly string[];
};

export const createToggleStore = (initial: ToggleInitial = {}) => {
  let state: ToggleState = {
    hidden: new Set(initial.hidden),
    disabled: new Set(initial.disabled),
    highlighted: new Set(initial.highlighted),
  };
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const toggled = (
    set: ReadonlySet<string>,
    key: string,
    on: boolean,
  ): ReadonlySet<string> | null => {
    if (set.has(key) === on) {
      return null;
    }
    const next = new Set(set);
    if (on) {
      next.add(key);
    } else {
      next.delete(key);
    }
    return next;
  };

  return {
    getState: (): ToggleState => state,
    isVisible: (key: string): boolean => !state.hidden.has(key),
    isEnabled: (key: string): boolean =>
      !state.hidden.has(key) && !state.disabled.has(key),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setVisible: (key: string, visible: boolean): void => {
      const hidden = toggled(state.hidden, key, !visible);
      if (hidden) {
        state = {...state, hidden};
        notify();
      }
    },
    isHighlighted: (key: string): boolean => state.highlighted.has(key),
    setHighlighted: (key: string, highlighted: boolean): void => {
      const next = toggled(state.highlighted, key, highlighted);
      if (next) {
        state = {...state, highlighted: next};
        notify();
      }
    },
    setEnabled: (key: string, enabled: boolean): void => {
      const disabled = toggled(state.disabled, key, !enabled);
      if (disabled) {
        state = {...state, disabled};
        notify();
      }
    },
  };
};

export type ToggleStore = ReturnType<typeof createToggleStore>;

export const TogglesContext = createContext<ToggleStore | null>(null);

export const useToggles = (): ToggleStore | null => useContext(TogglesContext);

const ALL_ON: ToggleState = {
  hidden: new Set(),
  disabled: new Set(),
  highlighted: new Set(),
};
const noSubscribe = () => () => {};

export const useToggleStoreState = (store: ToggleStore | null): ToggleState =>
  useSyncExternalStore(
    store ? store.subscribe : noSubscribe,
    store ? store.getState : () => ALL_ON,
  );

export const useToggleState = (): ToggleState =>
  useToggleStoreState(useToggles());

export const useIsVisible = (key: string): boolean => {
  const store = useToggles();
  return useSyncExternalStore(store ? store.subscribe : noSubscribe, () =>
    store ? store.isVisible(key) : true,
  );
};

export const useIsEnabled = (key: string): boolean => {
  const store = useToggles();
  return useSyncExternalStore(store ? store.subscribe : noSubscribe, () =>
    store ? store.isEnabled(key) : true,
  );
};

export const useIsHighlighted = (key: string): boolean => {
  const store = useToggles();
  return useSyncExternalStore(store ? store.subscribe : noSubscribe, () =>
    store ? store.isHighlighted(key) : false,
  );
};

const active: ToggleStore[] = [];
const activeListeners = new Set<() => void>();

const notifyActive = () => {
  for (const l of Array.from(activeListeners)) {
    try {
      l();
    } catch (e) {
      console.error(e);
    }
  }
};

export const registerActiveToggles = (store: ToggleStore): (() => void) => {
  active.push(store);
  notifyActive();
  return () => {
    const i = active.lastIndexOf(store);
    if (i >= 0) {
      active.splice(i, 1);
      notifyActive();
    }
  };
};

export const getActiveToggles = (): ToggleStore | null =>
  active[active.length - 1] ?? null;

export const subscribeActiveToggles = (listener: () => void) => {
  activeListeners.add(listener);
  return () => {
    activeListeners.delete(listener);
  };
};

export const useActiveToggles = (): ToggleStore | null =>
  useSyncExternalStore(subscribeActiveToggles, getActiveToggles);
