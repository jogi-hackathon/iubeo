import { useSyncExternalStore } from "react";
import { type BootProgress, boot } from "./boot";
import type { AppContext } from "./context";

export type BootState =
  | { status: "running"; progress: BootProgress | null }
  | { status: "ready"; ctx: AppContext }
  | { status: "error"; error: Error };

export const createBootStore = (
  run: (onProgress: (p: BootProgress) => void) => Promise<AppContext>,
) => {
  let state: BootState = { status: "running", progress: null };
  let started = false;
  const listeners = new Set<() => void>();

  const set = (next: BootState) => {
    state = next;
    for (const l of listeners) l();
  };

  return {
    getState: (): BootState => state,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** 何度呼んでも boot は1回だけ実行する(StrictMode の effect 二重実行対策) */
    start: (): void => {
      if (started) return;
      started = true;
      run((progress) => set({ status: "running", progress })).then(
        (ctx) => set({ status: "ready", ctx }),
        (e: unknown) => {
          console.error(e);
          set({
            status: "error",
            error: e instanceof Error ? e : new Error(String(e)),
          });
        },
      );
    },
  };
};

const store = createBootStore(boot);

export const startBoot = store.start;

export const useBootState = (): BootState =>
  useSyncExternalStore(store.subscribe, store.getState);
