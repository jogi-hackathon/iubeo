import {useSyncExternalStore} from "react";

import {lockPlayerControl} from "../../core/playerControl";

/**
 * - idle: 一人称。
 * - active: 俯瞰ビューに入っている(入る補間の途中を含む)。
 * - leaving: 一人称へ戻る補間の途中。終わるまで、プレイヤーは預かったままにする
 */
export type OverviewPhase = "idle" | "active" | "leaving";

export type OverviewState = {
  phase: OverviewPhase;
  /** idle 以外のとき、俯瞰しているディレクトリの id */
  directoryId: string | null;
  /** 今狙っているファイルの id(active で、入る補間が終わっているとき) */
  aimedFileId: string | null;
  /** 取り出しの要求を送って、結果(ファイルの spawn / 拒否)を待っている間。二重に送らないための印 */
  pending: boolean;
};

const IDLE: OverviewState = {
  phase: "idle",
  directoryId: null,
  aimedFileId: null,
  pending: false,
};

type Options = {
  /** プレイヤーを預かる。解除関数を返す。既定は core/playerControl */
  lock?: () => () => void;
};

/**
 * ディレクトリの俯瞰ビューの状態(クライアントだけが持つ。サーバーには送らない)。
 * idle 以外の間は、プレイヤーの移動・視点入力とカメラを預かる(core/playerControl)。
 * 状態は変更のたびに新しいオブジェクトにする(useSyncExternalStore の参照同一性のため)
 */
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
    /** 俯瞰に入る。一人称のときだけ入れる(入る・戻る途中は無視) */
    enter: (directoryId: string): boolean => {
      if (state.phase !== "idle") {
        return false;
      }
      release = lock();
      set({phase: "active", directoryId, aimedFileId: null, pending: false});
      return true;
    },
    /** 戻り始める。俯瞰中でなければ無視する */
    leave: (): void => {
      if (state.phase === "active") {
        set({...state, phase: "leaving", aimedFileId: null, pending: false});
      }
    },
    /** 戻る補間が終わった。プレイヤーを返す */
    finish: (): void => {
      if (state.phase === "leaving") {
        release?.();
        release = null;
        set(IDLE);
      }
    },
    /** 補間を待たず、すぐ一人称に戻す(ディレクトリが消えたときなど) */
    reset: (): void => {
      if (state.phase !== "idle") {
        release?.();
        release = null;
        set(IDLE);
      }
    },
    /** 取り出しの要求を送る許可を取る。俯瞰中で、要求中でなければ true(以後、endRequest まで false) */
    beginRequest: (): boolean => {
      if (state.phase !== "active" || state.pending) {
        return false;
      }
      set({...state, pending: true});
      return true;
    },
    /** 要求の結果が来た(拒否など、俯瞰に残る場合)。次の要求を受け付ける */
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

/** このディレクトリが俯瞰されているか。ほかのディレクトリの状態変化では再レンダーしない */
export const useIsOverviewing = (directoryId: string): boolean =>
  useSyncExternalStore(
    overview.subscribe,
    () => overview.getState().directoryId === directoryId,
  );

/** 俯瞰の段階だけを購読する(狙いの変化では再レンダーしない) */
export const useOverviewPhase = (): OverviewPhase =>
  useSyncExternalStore(overview.subscribe, () => overview.getState().phase);
