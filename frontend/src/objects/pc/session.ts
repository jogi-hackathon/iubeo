import {useSyncExternalStore} from "react";

import {
  resumePointerLock,
  suppressPointerLock,
} from "../../core/input/pointerLock";
import {lockPlayerControl} from "../../core/playerControl";

export type PcPhase = "idle" | "active" | "leaving";

/**
 * native: pointer lock を解き、離れ終わったら取り直す。
 * virtual: lock を解かないので取り直さない(Esc で外れたら、一人称に戻ってからクリックで取り直す)
 */
export type PcPointerMode = "native" | "virtual";

export type PcSessionState = {
  phase: PcPhase;
  objectId: string | null;
  pointer: PcPointerMode | null;
};

const IDLE: PcSessionState = {phase: "idle", objectId: null, pointer: null};

type Options = {
  lock?: () => () => void;
  suppressPointerLock?: () => () => void;
  exitPointerLock?: () => void;
  resumePointerLock?: () => void;
};

const exitDocumentPointerLock = (): void => {
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
};

export const createPcSession = ({
  lock = lockPlayerControl,
  suppressPointerLock: suppress = suppressPointerLock,
  exitPointerLock = exitDocumentPointerLock,
  resumePointerLock: resume = resumePointerLock,
}: Options = {}) => {
  // 変えるたびに新しいオブジェクトにする(useSyncExternalStore の参照同一性のため)
  let state = IDLE;
  let releases: Array<() => void> = [];
  const listeners = new Set<() => void>();

  const set = (next: PcSessionState) => {
    state = next;
    for (const l of Array.from(listeners)) {
      l();
    }
  };
  const releaseAll = () => {
    for (const release of releases.splice(0)) {
      release();
    }
  };

  return {
    getState: (): PcSessionState => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    enter: (objectId: string, pointer: PcPointerMode = "native"): boolean => {
      if (state.phase !== "idle") {
        return false;
      }
      if (pointer === "native") {
        releases = [lock(), suppress()];
        exitPointerLock();
      } else {
        releases = [lock()];
      }
      set({phase: "active", objectId, pointer});
      return true;
    },
    leave: (): void => {
      if (state.phase === "active") {
        set({...state, phase: "leaving"});
      }
    },
    finish: (): void => {
      if (state.phase === "leaving") {
        const {pointer} = state;
        releaseAll();
        set(IDLE);
        if (pointer === "native") {
          resume();
        }
      }
    },
    reset: (): void => {
      if (state.phase !== "idle") {
        releaseAll();
        set(IDLE);
      }
    },
  };
};

export type PcSession = ReturnType<typeof createPcSession>;

export const pcSession = createPcSession();

export const usePcSession = (session: PcSession = pcSession): PcSessionState =>
  useSyncExternalStore(session.subscribe, session.getState);
