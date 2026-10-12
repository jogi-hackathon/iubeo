import {useSyncExternalStore} from "react";

export type SpectatePhase = "alive" | "eliminating" | "spectating";

export const ELIMINATION_MS = 1500;

let phase: SpectatePhase = "alive";
const listeners = new Set<() => void>();

const set = (next: SpectatePhase): void => {
  if (phase === next) {
    return;
  }
  phase = next;
  for (const l of Array.from(listeners)) {
    l();
  }
};

export const getSpectatePhase = (): SpectatePhase => phase;

export const subscribeSpectate = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const isSpectating = (): boolean => phase === "spectating";

export const isEliminated = (): boolean => phase !== "alive";

/**
 * 生きていなければ何もしないので、何度呼んでも 1 回だけ効く(StrictMode の二重実行でも演出が延びない)
 */
export const beginElimination = (): void => {
  if (phase !== "alive") {
    return;
  }
  set("eliminating");
  setTimeout(() => {
    if (phase === "eliminating") {
      set("spectating");
    }
  }, ELIMINATION_MS);
};

export const resetSpectate = (): void => set("alive");

export const useSpectatePhase = (): SpectatePhase =>
  useSyncExternalStore(subscribeSpectate, getSpectatePhase);
