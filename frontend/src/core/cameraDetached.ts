import {useSyncExternalStore} from "react";

let detached = false;
const listeners = new Set<() => void>();

export const isCameraDetached = (): boolean => detached;

export const setCameraDetached = (value: boolean): void => {
  if (detached === value) {
    return;
  }
  detached = value;
  for (const l of Array.from(listeners)) {
    l();
  }
};

export const subscribeCameraDetached = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useCameraDetached = (): boolean =>
  useSyncExternalStore(subscribeCameraDetached, isCameraDetached);
