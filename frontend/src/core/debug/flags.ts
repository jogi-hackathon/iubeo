import {useSyncExternalStore} from "react";

export interface DebugFlags {
  stats: boolean;
  grid: boolean;
  bvh: boolean;
  freeCamera: boolean;
  /** ポストプロセス調整パネル(camera/postprocess) */
  postfx: boolean;
  /** シーン管理パネル(scenes/SceneDebugPanel) */
  scene: boolean;
  /** オブジェクト・アイテム管理パネル(dev/GameDebugPanel) */
  game: boolean;
}

/** VITE_ENABLE_DEBUG=true のときだけデバッグ機能(?debug・ホットキー)が有効になる */
export const DEBUG_AVAILABLE = import.meta.env.VITE_ENABLE_DEBUG === "true";

const ALL_OFF: DebugFlags = {
  stats: false,
  grid: false,
  bvh: false,
  freeCamera: false,
  postfx: false,
  scene: false,
  game: false,
};
const ALL_ON: DebugFlags = {
  stats: true,
  grid: true,
  bvh: false,
  freeCamera: false,
  postfx: false,
  scene: false,
  game: false,
};

/** デバッグ機能が有効で、URL に ?debug が付いているか(デバッグ用の既定シーン・stats・grid の ON の条件) */
export const DEBUG_REQUESTED =
  DEBUG_AVAILABLE && new URLSearchParams(window.location.search).has("debug");

const initial = (): DebugFlags => (DEBUG_REQUESTED ? ALL_ON : ALL_OFF);

let flags: DebugFlags = initial();
const listeners = new Set<() => void>();

export const getDebugFlags = (): DebugFlags => flags;

export const setDebugFlag = (key: keyof DebugFlags, value: boolean): void => {
  if (!DEBUG_AVAILABLE || flags[key] === value) {
    return;
  }
  flags = {...flags, [key]: value};
  for (const l of listeners) {
    l();
  }
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
