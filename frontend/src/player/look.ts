import {useSyncExternalStore} from "react";

import type {Look} from "./types";

export const LOOK_SENSITIVITY = 0.002;

const PITCH_EPSILON = 0.001;
const PITCH_LIMIT = Math.PI / 2 - PITCH_EPSILON;

const STORAGE_KEY = "iubeo:lookSensitivityScale";

const loadScale = (): number => {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(v) && v > 0 ? v : 1;
  } catch {
    return 1;
  }
};

/** LOOK_SENSITIVITY に掛ける倍率。dev パネルから変える(既定 1) */
let scale = loadScale();
const listeners = new Set<() => void>();

export const getLookSensitivityScale = (): number => scale;

export const setLookSensitivityScale = (next: number): void => {
  if (next === scale) {
    return;
  }
  scale = next;
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {}
  for (const l of listeners) {
    l();
  }
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useLookSensitivityScale = (): number =>
  useSyncExternalStore(subscribe, getLookSensitivityScale);

export const applyLook = <T extends Look>(
  state: T,
  dx: number,
  dy: number,
): T => {
  const k = LOOK_SENSITIVITY * scale;
  state.yaw -= dx * k;
  state.pitch = Math.max(
    -PITCH_LIMIT,
    Math.min(PITCH_LIMIT, state.pitch - dy * k),
  );
  return state;
};
