import {useSyncExternalStore} from "react";

import type {SlipContent} from "./content";

export type MemosState = {
  /** ワークスペースの id → そこのメモ置きに残っている伝票(最新の 1 枚) */
  byWorkspace: Readonly<Record<string, SlipContent>>;
};

/** 机のメモ置きに残っている伝票。フェーズごとに差し替わり、セッションを離れると消える */
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
