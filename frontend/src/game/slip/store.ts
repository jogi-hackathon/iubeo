import {useSyncExternalStore} from "react";
import type {Matrix4} from "three";

import {isPlayerControlLocked} from "../../core/playerControl";
import type {GamePhase} from "../../net";
import type {GameObject} from "../../objects/types";
import {WORKSPACE_KIND} from "../../objects/workspace/data";
import type {PlayerId} from "../../player/types";
import {type SlipContent, slipContent} from "./content";
import {memos, type MemosStore} from "./memos";

/** 再生中の伝票。startedAt は performance.now() 基準(ms) */
export type OrderSlipPlayback = {
  content: SlipContent;
  startedAt: number;
};

/** 手を離れてワークスペースへ飛んでいる伝票 */
export type OrderSlipFlight = {
  content: SlipContent;
  /** 飛び始めの伝票の世界座標(行列の要素。手元の帯の根元が原点) */
  from: readonly number[];
  startedAt: number;
  /** 飛んでいく先のワークスペースの id */
  workspaceId: string;
};

export type OrderSlipState = {
  playing: OrderSlipPlayback | null;
  /** 他の操作(PC・ワークスペースなど)に預けている間に届いた分。空いたら始める */
  pending: SlipContent | null;
  flight: OrderSlipFlight | null;
  /** 伝票の飛んでいく先(自分のワークスペース)。無ければ飛ばさずに消える */
  target: string | null;
};

export type OrderSlipStoreOptions = {
  now?: () => number;
  /** 他の誰かが操作を預かっているか。預かられていれば待つ */
  isBusy?: () => boolean;
  memos?: Pick<MemosStore, "place">;
};

/**
 * 依頼(伝票)の再生の状態。届いたら deliver に渡す。
 * 操作が空いていればすぐ始め、空いていなければ(PC の画面やワークスペースの作業中)終わるまで待つ。
 * 再生中にもう 1 枚届いたら、終わってから続けて出す(最後の 1 枚だけ残す)。
 * 見終えた伝票は launch で手を離れ、終える(finish)ときに飛ぶ先のメモ置きへ残す
 */
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
    /** 伝票が手を離れた。飛ぶ先があれば、そこへ向かう伝票として覚える */
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
    /** 飛んでいた伝票がメモ置きに着いた。そこに残す */
    land: (): void => {
      const {flight} = state;
      if (!flight) {
        return;
      }
      memoStore.place(flight.workspaceId, flight.content);
      set({...state, flight: null});
    },
    /** 再生を終える。まだ飛んでいた伝票はメモ置きに残し、待っている分があり操作が空いていれば続けて始める */
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
    /** 操作が空いたときに呼ぶ。待っている分があれば始める */
    resume: (): void => {
      if (state.playing || !state.pending || isBusy()) {
        return;
      }
      start(state.pending);
    },
    /** 再生も待ちも捨てる(セッションを離れたとき・脱落したとき)。飛ぶ先は保つ */
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

/**
 * フェーズが始まったときに自分へ届く伝票。自分のタスクが無い、まだ始まっていない、同じフェーズを出した後なら null。
 * delivered は出し終えたフェーズ番号(接続し直しで同じフェーズを受け取っても、二度は出さない)
 */
export const slipForPhase = (
  phase: GamePhase | null,
  myPlayerId: PlayerId | null,
  delivered: ReadonlySet<number>,
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
  return mine.length === 0 ? null : slipContent(phase, mine);
};

/** 伝票の飛んでいく先: 自分が owner のワークスペース。owner が無い場でワークスペースが 1 つだけなら、それ */
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
