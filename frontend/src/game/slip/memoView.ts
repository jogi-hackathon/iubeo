import {useSyncExternalStore} from "react";

import {lockPlayerControl} from "../../core/playerControl";

export type MemoViewPhase = "idle" | "active" | "leaving";

export type MemoViewState = {
  phase: MemoViewPhase;
  /** 寄って見ているメモ置きのワークスペースの id */
  workspaceId: string | null;
};

const IDLE: MemoViewState = {phase: "idle", workspaceId: null};

type Options = {
  lock?: () => () => void;
};

/**
 * 机のメモ置きの伝票を拡大して見る状態(クライアントだけが持つ)。
 * idle 以外の間は、プレイヤーの移動・視点入力とカメラを預かる(core/playerControl)。
 * 寄る(active)→ 戻る(leaving)→ 戻りきったら finish で預かりを解く
 */
export const createMemoViewStore = ({
  lock = lockPlayerControl,
}: Options = {}) => {
  let state: MemoViewState = IDLE;
  let release: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const set = (next: MemoViewState) => {
    state = next;
    for (const l of Array.from(listeners)) {
      l();
    }
  };

  return {
    getState: (): MemoViewState => state,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    enter: (workspaceId: string): boolean => {
      if (state.phase !== "idle") {
        return false;
      }
      release = lock();
      set({phase: "active", workspaceId});
      return true;
    },
    leave: (): void => {
      if (state.phase === "active") {
        set({...state, phase: "leaving"});
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
  };
};

export const memoView = createMemoViewStore();

export const useMemoView = (): MemoViewState =>
  useSyncExternalStore(memoView.subscribe, memoView.getState);
