import { useSyncExternalStore } from "react";

export interface DebugFlags {
  stats: boolean;
  grid: boolean;
  bvh: boolean;
  freeCamera: boolean;
  /** ポストプロセス調整パネル(camera/postprocess) */
  postfx: boolean;
}

/** VITE_ENABLE_DEBUG=true のときだけデバッグ機能(?debug・ホットキー)が有効になる */
export const DEBUG_AVAILABLE = import.meta.env.VITE_ENABLE_DEBUG === "true";

const ALL_OFF: DebugFlags = {
  stats: false,
  grid: false,
  bvh: false,
  freeCamera: false,
  postfx: false,
};
const ALL_ON: DebugFlags = {
  stats: true,
  grid: true,
  bvh: false,
  freeCamera: false,
  postfx: false,
};

const initial = (): DebugFlags => {
  if (!DEBUG_AVAILABLE) return ALL_OFF;
  return new URLSearchParams(window.location.search).has("debug")
    ? ALL_ON
    : ALL_OFF;
};

let flags: DebugFlags = initial();
const listeners = new Set<() => void>();

export const getDebugFlags = (): DebugFlags => flags;

export const setDebugFlag = (key: keyof DebugFlags, value: boolean): void => {
  if (!DEBUG_AVAILABLE || flags[key] === value) return;
  flags = { ...flags, [key]: value };
  for (const l of listeners) l();
};

export const toggleDebugFlag = (key: keyof DebugFlags): void => {
  setDebugFlag(key, !flags[key]);
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useDebugFlags = (): DebugFlags =>
  useSyncExternalStore(subscribe, getDebugFlags);
