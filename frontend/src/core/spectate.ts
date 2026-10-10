import {useSyncExternalStore} from "react";

/**
 * 脱落してから観戦に移るまで(および観戦中)の状態。
 * - alive: 生きている(通常の一人称)
 * - eliminating: 脱落の演出を出している間(身体も操作も止める)
 * - spectating: FlyCamera で観戦している。物には触れない
 *
 * デバッグ用の freeCamera(F8)とは別物にする(観戦はゲームの状態から来る。debug flags は開発時しか効かない)
 */
export type SpectatePhase = "alive" | "eliminating" | "spectating";

/** 脱落の演出を出してから観戦に移るまでの時間(ms) */
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

/** 観戦中か(FlyCamera を動かす条件) */
export const isSpectating = (): boolean => phase === "spectating";

/** 脱落したか(演出中も含む)。true の間は身体を止め、物に触れない */
export const isEliminated = (): boolean => phase !== "alive";

/**
 * 脱落の演出を始め、ELIMINATION_MS 後に観戦へ移る。
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

/** 通常の状態に戻す(セッションを離れるとき) */
export const resetSpectate = (): void => set("alive");

export const useSpectatePhase = (): SpectatePhase =>
  useSyncExternalStore(subscribeSpectate, getSpectatePhase);
