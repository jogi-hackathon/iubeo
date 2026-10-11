import {useSyncExternalStore} from "react";

import {
  resumePointerLock,
  suppressPointerLock,
} from "../../core/input/pointerLock";
import {lockPlayerControl} from "../../core/playerControl";

/**
 * PC を使っている状態（クライアントだけが持つ。サーバーには送らない）。
 *
 * - idle: 一人称。PC は消えている（電源が入っていない）
 * - active: PC を使っている。プレイヤーを預かり、カメラは画面の前、マウスと鍵盤は画面へ向く
 * - leaving: 一人称へ戻る補間の途中。終わるまでプレイヤーは預かったままにする
 *
 * 状態は変えるたびに新しいオブジェクトにする（useSyncExternalStore の参照同一性のため）
 */
export type PcPhase = "idle" | "active" | "leaving";

export type PcSessionState = {
  phase: PcPhase;
  objectId: string | null;
};

const IDLE: PcSessionState = {phase: "idle", objectId: null};

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
    enter: (objectId: string): boolean => {
      if (state.phase !== "idle") {
        return false;
      }
      releases = [lock(), suppress()];
      exitPointerLock();
      set({phase: "active", objectId});
      return true;
    },
    leave: (): void => {
      if (state.phase === "active") {
        set({...state, phase: "leaving"});
      }
    },
    finish: (): void => {
      if (state.phase === "leaving") {
        releaseAll();
        set(IDLE);
        resume();
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
