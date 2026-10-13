import type {Item} from "../items/types";
import type {Team} from "../net/types";
import type {GameObject, InteractRequest} from "../objects/types";
import type {PlayerId} from "../player/types";
import type {AuthorityMessage} from "./apply";

export type AuthorityDev = {
  deliver: (message: AuthorityMessage) => void;
  getObject: (id: string) => GameObject | undefined;
  getObjects: () => readonly GameObject[];
  getHeldItem: () => Item | null;
  setHeldItem: (item: Item | null) => void;
  getAchieved: () => number;
  getTeam: () => Team;
  setTeam: (patch: Partial<Team>) => void;
};

export type AuthorityHandle = {
  playerId: PlayerId;
  kind: "local" | "server";
  send: (request: InteractRequest) => void;
  dev?: AuthorityDev;
};

export type AuthorityRegistry = {
  register: (handle: AuthorityHandle) => () => void;
  current: () => AuthorityHandle | null;
  subscribe: (listener: () => void) => () => void;
};

export const createAuthorityRegistry = (): AuthorityRegistry => {
  let stack: AuthorityHandle[] = [];
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  return {
    register: (handle) => {
      const entry: AuthorityHandle = {...handle};
      stack = [...stack, entry];
      notify();
      return () => {
        if (!stack.includes(entry)) {
          return;
        }
        stack = stack.filter((h) => h !== entry);
        notify();
      };
    },
    current: () => stack[stack.length - 1] ?? null,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const authorityRegistry = createAuthorityRegistry();
