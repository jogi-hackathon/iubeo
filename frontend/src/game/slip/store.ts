import {useSyncExternalStore} from "react";
import type {Matrix4} from "three";

import {isPlayerControlLocked} from "../../core/playerControl";
import type {GamePhase} from "../../net";
import type {GameObject} from "../../objects/types";
import {WORKSPACE_KIND} from "../../objects/workspace/data";
import type {PlayerId} from "../../player/types";
import {type SlipContent, slipContent} from "./content";
import {memos, type MemosStore} from "./memos";

export type OrderSlipPlayback = {
  content: SlipContent;
  startedAt: number;
};

export type OrderSlipFlight = {
  content: SlipContent;
  from: readonly number[];
  startedAt: number;
  workspaceId: string;
};

export type OrderSlipState = {
  playing: OrderSlipPlayback | null;
  pending: SlipContent | null;
  flight: OrderSlipFlight | null;
  target: string | null;
};

export type OrderSlipStoreOptions = {
  now?: () => number;
  isBusy?: () => boolean;
  memos?: Pick<MemosStore, "place">;
};

export const createOrderSlipStore = ({
  now = () => performance.now(),
  isBusy = isPlayerControlLocked,
  memos: memoStore = memos,
}: OrderSlipStoreOptions = {}) => {
  let state: OrderSlipState = {
    playing: null,
    pending: null,
    flight: null,
    target: null,
  };
  const listeners = new Set<() => void>();

  const set = (next: OrderSlipState) => {
    state = next;
    for (const l of Array.from(listeners)) {
      l();
    }
  };

  const start = (content: SlipContent) =>
    set({...state, playing: {content, startedAt: now()}, pending: null});

  const api = {
    getState: (): OrderSlipState => state,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    deliver: (content: SlipContent): void => {
      if (state.playing || isBusy()) {
        set({...state, pending: content});
        return;
      }
      start(content);
    },
    setTarget: (workspaceId: string | null): void => {
      if (state.target !== workspaceId) {
        set({...state, target: workspaceId});
      }
    },
    launch: (slipWorld: Matrix4): void => {
      const {playing, target} = state;
      if (!playing || !target || state.flight) {
        return;
      }
      set({
        ...state,
        flight: {
          content: playing.content,
          from: slipWorld.toArray(),
          startedAt: now(),
          workspaceId: target,
        },
      });
    },
    land: (): void => {
      const {flight} = state;
      if (!flight) {
        return;
      }
      memoStore.place(flight.workspaceId, flight.content);
      set({...state, flight: null});
    },
    finish: (): void => {
      if (!state.playing) {
        return;
      }
      const {pending, flight} = state;
      if (flight) {
        memoStore.place(flight.workspaceId, flight.content);
      }
      state = {...state, playing: null, flight: null};
      if (pending && !isBusy()) {
        start(pending);
        return;
      }
      set({...state, pending});
    },
    resume: (): void => {
      if (state.playing || !state.pending || isBusy()) {
        return;
      }
      start(state.pending);
    },
    reset: (): void => {
      if (state.playing || state.pending || state.flight) {
        set({...state, playing: null, pending: null, flight: null});
      }
    },
  };
  return api;
};

export type OrderSlipStore = ReturnType<typeof createOrderSlipStore>;

export const orderSlip = createOrderSlipStore();

export const useOrderSlip = (): OrderSlipState =>
  useSyncExternalStore(orderSlip.subscribe, orderSlip.getState);

export const slipForPhase = (
  phase: GamePhase | null,
  myPlayerId: PlayerId | null,
  delivered: ReadonlySet<number>,
  fileColors: ReadonlyMap<string, string> = new Map(),
): SlipContent | null => {
  if (!phase || myPlayerId === null || phase.status !== "active") {
    return null;
  }
  if (delivered.has(phase.number)) {
    return null;
  }
  const mine = phase.tasks.filter(
    (task) => task.assigneePlayerId === myPlayerId,
  );
  return mine.length === 0 ? null : slipContent(phase, mine, fileColors);
};

export const myWorkspaceId = (
  objects: readonly GameObject[],
  myPlayerId: PlayerId | null,
): string | null => {
  const workspaces = objects.filter((o) => o.kind === WORKSPACE_KIND);
  const mine = workspaces.find(
    (o) => myPlayerId !== null && o.owner === myPlayerId,
  );
  if (mine) {
    return mine.id;
  }
  const only = workspaces.length === 1 ? workspaces[0] : undefined;
  return only && only.owner === undefined ? only.id : null;
};
