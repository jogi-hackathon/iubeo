import {useSyncExternalStore} from "react";

import type {Team} from "../net/types";

export const INITIAL_TEAM: Team = {bypassPermission: false, fireStarted: false};

export type TeamStore = {
  get: () => Team;
  set: (team: Team) => void;
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

export const teamStore = createTeamStore();

export const useTeamState = (): Team =>
  useSyncExternalStore(teamStore.subscribe, teamStore.get);
