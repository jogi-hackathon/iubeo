import {useSyncExternalStore} from "react";

import {lockPlayerControl} from "../../../core/playerControl";

/**
 * 窓の外に流れるスタッフクレジットの状態(クライアントだけが持つ。サーバーには送らない)。
 *
 * - idle: 一人称
 * - active: カメラを窓の正面へ預かり、空にクレジットを流している
 * - leaving: 一人称へ戻る補間の途中。終わるまでプレイヤーは預かったままにする
 */
export type CreditsPhase = "idle" | "active" | "leaving";

type Options = {
  lock?: () => () => void;
};

export const createCreditsStore = ({
  lock = lockPlayerControl,
}: Options = {}) => {
  let phase: CreditsPhase = "idle";
  let release: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const set = (next: CreditsPhase) => {
    phase = next;
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  return {
    getPhase: (): CreditsPhase => phase,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    enter: (): boolean => {
      if (phase !== "idle") {
        return false;
      }
      release = lock();
      set("active");
      return true;
    },
    leave: (): void => {
      if (phase === "active") {
        set("leaving");
      }
    },
    finish: (): void => {
      if (phase === "leaving") {
        release?.();
        release = null;
        set("idle");
      }
    },
    reset: (): void => {
      if (phase !== "idle") {
        release?.();
        release = null;
        set("idle");
      }
    },
  };
};

export type CreditsStore = ReturnType<typeof createCreditsStore>;

export const credits = createCreditsStore();

export const useCreditsPhase = (): CreditsPhase =>
  useSyncExternalStore(credits.subscribe, credits.getPhase);
