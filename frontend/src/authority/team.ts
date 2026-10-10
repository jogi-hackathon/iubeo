import {useSyncExternalStore} from "react";

import type {Team} from "../net/types";

/** 勝利フラグの最初の値(どちらも立っていない) */
export const INITIAL_TEAM: Team = {bypassPermission: false, fireStarted: false};

/**
 * 勝利フラグ(team)の入れ物。オーソリティの通知(team.updated。サーバーは snapshot の game.team も)を apply.ts が書き、
 * 演出(ディレクトリの炎など)とデバッグパネルが読む。値は変わるまで同じ参照(useSyncExternalStore 用)
 */
export type TeamStore = {
  get: () => Team;
  /** 書き換える。値が同じなら何もしない(参照も変えず、通知もしない) */
  set: (team: Team) => void;
  /** 最初の値に戻す(オーソリティを外すとき) */
  reset: () => void;
  subscribe: (listener: () => void) => () => void;
};

export const createTeamStore = (): TeamStore => {
  let team = INITIAL_TEAM;
  const listeners = new Set<() => void>();
  const set = (next: Team): void => {
    if (
      next.bypassPermission === team.bypassPermission &&
      next.fireStarted === team.fireStarted
    ) {
      return;
    }
    team = {...next};
    for (const l of Array.from(listeners)) {
      l();
    }
  };
  return {
    get: () => team,
    set,
    reset: () => set(INITIAL_TEAM),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

/** アプリ全体で 1 つの勝利フラグ */
export const teamStore = createTeamStore();

/** 今の勝利フラグ(変わると描き直す) */
export const useTeamState = (): Team =>
  useSyncExternalStore(teamStore.subscribe, teamStore.get);
