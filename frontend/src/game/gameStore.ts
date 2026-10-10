import {useSyncExternalStore} from "react";

import type {GamePhase, GameResult, SessionStatus, TaskStatus} from "../net";

/**
 * ゲームの状態(フェーズ・タスク・結果・サーバー時計)。状態の正はサーバーで、ここは通知を反映するだけ
 * (判定はしない。ADR-0003)。残り時間は保存せず、締切(deadlineAt)とサーバー時計のずれから毎回計算する
 */
export type GameState = {
  /** サーバーの session.status。接続前は null */
  sessionStatus: SessionStatus | null;
  /** 今のフェーズ。開始前・接続前は null */
  phase: GamePhase | null;
  /** フェーズの間(intermission)。次の phase.started で false に戻る */
  intermission: boolean;
  /** 決着していれば結果。接続前と着手中は null */
  result: GameResult | null;
  /** サーバー時刻 - クライアント時刻(ms)。残り時間の計算に使う */
  serverOffsetMs: number;
};

export type GameStoreOptions = {
  /** 今の時刻(ms)。テストで固定する用。既定は Date.now */
  now?: () => number;
};

/** snapshot の game と serverTime を反映するための入力 */
export type SnapshotInput = {
  status: SessionStatus;
  game: {phase: GamePhase | null; result: GameResult | null};
  /** 送信時のサーバー時刻。無ければ時計のずれは更新しない */
  serverTime?: string;
};

const initialState = (): GameState => ({
  sessionStatus: null,
  phase: null,
  intermission: false,
  result: null,
  serverOffsetMs: 0,
});

export const createGameStore = ({
  now = () => Date.now(),
}: GameStoreOptions = {}) => {
  // state は変更のたびに新しいオブジェクトにする(useSyncExternalStore の参照同一性のため)
  let state: GameState = initialState();
  const listeners = new Set<() => void>();

  const set = (patch: Partial<GameState>) => {
    state = {...state, ...patch};
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  /**
   * サーバー時刻から時計のずれ(ms)を出す。読めなければ null(そのときは前の値を保つ)。
   * 残り時間は、これと deadlineAt から出す
   */
  const offsetOf = (serverTime: string | undefined): number | null => {
    if (!serverTime) {
      return null;
    }
    const parsed = Date.parse(serverTime);
    return Number.isNaN(parsed) ? null : parsed - now();
  };

  return {
    getState: (): GameState => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** 接続・再接続の snapshot で丸ごと入れ替える(フェーズ・結果・時計) */
    applySnapshot: ({status, game, serverTime}: SnapshotInput): void => {
      const offset = offsetOf(serverTime);
      set({
        sessionStatus: status,
        phase: game.phase,
        // フェーズの間(intermission)に再接続した場合も、その表示に戻す
        intermission:
          status === "intermission" || game.phase?.status === "intermission",
        result: game.result,
        ...(offset === null ? {} : {serverOffsetMs: offset}),
      });
    },
    /** 全員そろってゲームが始まった */
    started: (): void => {
      set({sessionStatus: "playing"});
    },
    /** フェーズが始まった(タスク一覧と締切が届く) */
    phaseStarted: (phase: GamePhase, serverTime: string): void => {
      const offset = offsetOf(serverTime);
      set({
        phase,
        intermission: false,
        sessionStatus: "playing",
        ...(offset === null ? {} : {serverOffsetMs: offset}),
      });
    },
    /**
     * フェーズが終わった。intermission なら次があるので、その間の表示に切り替える
     * (締切は過ぎているので、残り時間は出さない)
     */
    phaseEnded: (next: "intermission" | "completed"): void => {
      const phase = state.phase;
      set({
        phase: phase
          ? {
              ...phase,
              status: next === "intermission" ? "intermission" : "completed",
            }
          : null,
        intermission: phase !== null && next === "intermission",
      });
    },
    /** 誰かのタスクが 1 つ達成された(自分の物かは見ない。HUD が担当で絞る) */
    taskCompleted: (taskId: string, completedAt: string): void => {
      const phase = state.phase;
      if (!phase) {
        return;
      }
      let changed = false;
      const tasks = phase.tasks.map((task) => {
        if (task.taskId !== taskId || task.status === "completed") {
          return task;
        }
        changed = true;
        return {
          ...task,
          status: "completed" as TaskStatus,
          completedAt,
        };
      });
      if (changed) {
        set({phase: {...phase, tasks}});
      }
    },
    /**
     * 決着した。結果は console に出し、room へ戻った後も HUD が読めるよう持っておく
     * (勝敗画面は作らないので、出すのはここまで。state-schema §5.2)
     */
    finished: (result: GameResult): void => {
      console.log(`[game] 決着: ${result.outcome}`, result);
      set({result, sessionStatus: "finished"});
    },
    /** フェーズ・接続の状態を消す(オーソリティを外すとき)。結果は、room へ戻った後で見せるために残す */
    reset: (): void => {
      set({sessionStatus: null, phase: null, intermission: false});
    },
  };
};

export type GameStore = ReturnType<typeof createGameStore>;

/** アプリ全体で 1 つのゲームの状態 */
export const gameStore = createGameStore();

/** 今のゲームの状態(変わると描き直す) */
export const useGameState = (): GameState =>
  useSyncExternalStore(gameStore.subscribe, gameStore.getState);

/**
 * 締切までの残り(ms)。フェーズが active でない・intermission の間・締切が読めないときは null。
 * サーバー時刻を基準にするので、端末の時計がずれていても正しく出る(state-schema §1)
 */
export const remainingMs = (state: GameState, nowMs: number): number | null => {
  const phase = state.phase;
  if (!phase || phase.status !== "active" || state.intermission) {
    return null;
  }
  const deadline = Date.parse(phase.deadlineAt);
  if (Number.isNaN(deadline)) {
    return null;
  }
  return deadline - (nowMs + state.serverOffsetMs);
};
