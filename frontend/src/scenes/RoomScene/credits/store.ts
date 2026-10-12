import {useSyncExternalStore} from "react";

import {lockPlayerControl} from "../../../core/playerControl";

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
