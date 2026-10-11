import {useEffect, useSyncExternalStore} from "react";

const disabled = new Set<string>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const l of Array.from(listeners)) {
    l();
  }
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const isObjectDisabled = (id: string): boolean => disabled.has(id);

export const useIsObjectDisabled = (id: string): boolean =>
  useSyncExternalStore(subscribe, () => disabled.has(id));

export const disableObject = (id: string): (() => void) => {
  disabled.add(id);
  notify();
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    disabled.delete(id);
    notify();
  };
};

export const useDisableObjectWhile = (id: string, when: boolean): void => {
  useEffect(() => (when ? disableObject(id) : undefined), [id, when]);
};
