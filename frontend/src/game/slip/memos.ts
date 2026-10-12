import {useSyncExternalStore} from "react";

import type {GamePhase} from "../../net";
import type {PlayerId} from "../../player/types";
import type {SlipContent} from "./content";

export type MemosState = {
  byWorkspace: Readonly<Record<string, SlipContent>>;
};

export const createMemosStore = () => {
  let state: MemosState = {byWorkspace: {}};
  const listeners = new Set<() => void>();
  const set = (next: MemosState) => {
    state = next;
    for (const l of Array.from(listeners)) {
      l();
    }
  };
  return {
    getState: (): MemosState => state,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    place: (workspaceId: string, content: SlipContent): void => {
      set({byWorkspace: {...state.byWorkspace, [workspaceId]: content}});
    },
    clear: (): void => {
      if (Object.keys(state.byWorkspace).length > 0) {
        set({byWorkspace: {}});
      }
    },
  };
};

export type MemosStore = ReturnType<typeof createMemosStore>;

export const memos = createMemosStore();

export const useMemoAt = (workspaceId: string): SlipContent | null =>
  useSyncExternalStore(
    memos.subscribe,
    () => memos.getState().byWorkspace[workspaceId] ?? null,
  );

export const isMemoDone = (
  memo: SlipContent,
  phase: GamePhase | null,
  myPlayerId: PlayerId | null,
): boolean => {
  if (!phase) {
    return false;
  }
  if (phase.number !== memo.phase) {
    return phase.number > memo.phase;
  }
  const mine = phase.tasks.filter(
    (task) => task.assigneePlayerId === myPlayerId,
  );
  return mine.length > 0 && mine.every((task) => task.status === "completed");
};
