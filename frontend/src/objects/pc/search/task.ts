import {useSyncExternalStore} from "react";

export const TASK_PRESETS: readonly string[] = [
  "firefox-wasm",
  "WISP protocol",
  "three.js",
  "WebAssembly",
  "emscripten",
  "Playwright",
  "Gecko engine",
  "React Three Fiber",
  "MDN Web Docs",
  "Vite",
  "wisp-js",
  "Mercury Workshop",
];

export const pickTask = (
  current?: string,
  random: () => number = Math.random,
): string => {
  const pool = TASK_PRESETS.filter((word) => word !== current);
  return pool[Math.floor(random() * pool.length)] ?? TASK_PRESETS[0] ?? "";
};

export const initialTask = (search: string): string =>
  new URLSearchParams(search).get("task")?.trim() || pickTask();

export type TaskStore = ReturnType<typeof createTaskStore>;

export const createTaskStore = (initial: string) => {
  let task = initial;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of Array.from(listeners)) {
      l();
    }
  };
  return {
    getTask: (): string => task,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    draw: (random?: () => number): string => {
      task = pickTask(task, random);
      notify();
      return task;
    },
  };
};

const initialTaskFromLocation = (): string =>
  typeof location === "undefined" ? pickTask() : initialTask(location.search);

export const taskStore = createTaskStore(initialTaskFromLocation());

export const useTask = (store: TaskStore = taskStore): string =>
  useSyncExternalStore(store.subscribe, store.getTask);
