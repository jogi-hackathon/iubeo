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

/** id の機能を止めているか */
export const isObjectDisabled = (id: string): boolean => disabled.has(id);

/** id の機能を止めているか(変わると描き直す) */
export const useIsObjectDisabled = (id: string): boolean =>
  useSyncExternalStore(subscribe, () => disabled.has(id));

/** id の機能を止める。戻り値で戻す(2 回戻しても、後から止め直した分は消さない) */
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

/** when の間、id の機能を止める(アンマウントや when が false になると戻す) */
export const useDisableObjectWhile = (id: string, when: boolean): void => {
  useEffect(() => (when ? disableObject(id) : undefined), [id, when]);
};
