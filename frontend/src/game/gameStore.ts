import {useSyncExternalStore} from "react";

import type {GamePhase, GameResult, SessionStatus, TaskStatus} from "../net";

export type GameState = {
  sessionStatus: SessionStatus | null;
  phase: GamePhase | null;
  intermission: boolean;
  result: GameResult | null;
  serverOffsetMs: number;
};

export type GameStoreOptions = {
  now?: () => number;
};

export type SnapshotInput = {
  status: SessionStatus;
  game: {phase: GamePhase | null; result: GameResult | null};
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
    applySnapshot: ({status, game, serverTime}: SnapshotInput): void => {
      const offset = offsetOf(serverTime);
      set({
        sessionStatus: status,
        phase: game.phase,
        intermission:
          status === "intermission" || game.phase?.status === "intermission",
        result: game.result,
        ...(offset === null ? {} : {serverOffsetMs: offset}),
      });
    },
    started: (): void => {
      set({sessionStatus: "playing"});
    },
    phaseStarted: (phase: GamePhase, serverTime: string): void => {
      const offset = offsetOf(serverTime);
      set({
        phase,
        intermission: false,
        sessionStatus: "playing",
        ...(offset === null ? {} : {serverOffsetMs: offset}),
      });
    },
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
    finished: (result: GameResult): void => {
      console.log(`[game] 決着: ${result.outcome}`, result);
      set({result, sessionStatus: "finished"});
    },
    reset: (): void => {
      set({sessionStatus: null, phase: null, intermission: false});
    },
  };
};

export type GameStore = ReturnType<typeof createGameStore>;

export const gameStore = createGameStore();

export const useGameState = (): GameState =>
  useSyncExternalStore(gameStore.subscribe, gameStore.getState);

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
