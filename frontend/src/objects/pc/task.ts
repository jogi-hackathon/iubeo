import {useSyncExternalStore} from "react";

/**
 * Web Search のお題。画面の中で検索して答えを見つけるための語。
 *
 * 判定が一意になりやすいよう、公式の情報源が明確な語を並べている。HUD は使わず、机のメモ（3D）に
 * 出す。メモをクリックすると、今のお題とは別の語を引く。
 * `?task=<語>` で固定できる（確認用）。
 */
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

/** 今のお題とは別の語を 1 つ引く（プリセットが 1 つしか無いときは、それを返す） */
export const pickTask = (
  current?: string,
  random: () => number = Math.random,
): string => {
  const pool = TASK_PRESETS.filter((word) => word !== current);
  return pool[Math.floor(random() * pool.length)] ?? TASK_PRESETS[0] ?? "";
};

/** URL の `?task=` があればそれを、無ければプリセットから引く */
export const initialTask = (search: string): string =>
  new URLSearchParams(search).get("task")?.trim() || pickTask();

export type TaskStore = ReturnType<typeof createTaskStore>;

/** 今のお題を持つ。引き直すと、購読している側（メモ）が描き直す */
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
    /** 次のお題を引く。引いた語を返す */
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
