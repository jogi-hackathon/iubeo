import {useSyncExternalStore} from "react";

import {lockPlayerControl} from "../../core/playerControl";

export type OverviewPhase = "idle" | "active" | "leaving";

export type OverviewState = {
  phase: OverviewPhase;
  directoryId: string | null;
  aimedFileId: string | null;
  pending: boolean;
};

const IDLE: OverviewState = {
  phase: "idle",
  directoryId: null,
  aimedFileId: null,
  pending: false,
};

type Options = {
  lock?: () => () => void;
};

export const createOverviewStore = ({
  lock = lockPlayerControl,
}: Options = {}) => {
  let state: OverviewState = IDLE;
  let release: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const set = (next: OverviewState) => {
    state = next;
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  return {
    getState: (): OverviewState => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    enter: (directoryId: string): boolean => {
      if (state.phase !== "idle") {
        return false;
      }
      release = lock();
      set({phase: "active", directoryId, aimedFileId: null, pending: false});
      return true;
    },
    leave: (): void => {
      if (state.phase === "active") {
        set({...state, phase: "leaving", aimedFileId: null, pending: false});
      }
    },
    finish: (): void => {
      if (state.phase === "leaving") {
        release?.();
        release = null;
        set(IDLE);
      }
    },
    reset: (): void => {
      if (state.phase !== "idle") {
        release?.();
        release = null;
        set(IDLE);
      }
    },
    beginRequest: (): boolean => {
      if (state.phase !== "active" || state.pending) {
        return false;
      }
      set({...state, pending: true});
      return true;
    },
    endRequest: (): void => {
      if (state.pending) {
        set({...state, pending: false});
      }
    },
    setAimedFile: (id: string | null): void => {
      if (state.phase === "active" && state.aimedFileId !== id) {
        set({...state, aimedFileId: id});
      }
    },
  };
};

export type OverviewStore = ReturnType<typeof createOverviewStore>;

export const overview = createOverviewStore();

export const useOverviewState = (): OverviewState =>
  useSyncExternalStore(overview.subscribe, overview.getState);

export const useIsOverviewing = (directoryId: string): boolean =>
  useSyncExternalStore(
    overview.subscribe,
    () => overview.getState().directoryId === directoryId,
  );

export const useOverviewPhase = (): OverviewPhase =>
  useSyncExternalStore(overview.subscribe, () => overview.getState().phase);
