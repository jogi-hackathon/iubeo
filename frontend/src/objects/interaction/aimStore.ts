import {useSyncExternalStore} from "react";

// 今狙っているオブジェクトの id。毎フレーム Interaction が書き、アウトラインとレティクルが読む
let aimed: string | null = null;
const listeners = new Set<() => void>();

export const getAimedObjectId = (): string | null => aimed;

/** 変わったときだけ通知する(毎フレーム呼んでも再描画は起きない) */
export const setAimedObjectId = (id: string | null): void => {
  if (aimed === id) {
    return;
  }
  aimed = id;
  for (const l of Array.from(listeners)) {
    l();
  }
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useAimedObjectId = (): string | null =>
  useSyncExternalStore(subscribe, getAimedObjectId);
