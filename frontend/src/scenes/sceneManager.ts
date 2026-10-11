import type {SceneName} from "./index";

export type SceneState = {current: SceneName};

export type SceneManagerOptions = {
  initial: SceneName;
  available: readonly SceneName[];
};

export const createSceneManager = ({
  initial,
  available,
}: SceneManagerOptions) => {
  if (!available.includes(initial)) {
    throw new Error(`使えないシーンです: ${initial}`);
  }

  // state は変更のたびに新しいオブジェクトにする(useSyncExternalStore の参照同一性のため)
  let state: SceneState = {current: initial};
  const listeners = new Set<() => void>();

  return {
    getState: (): SceneState => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isAvailable: (scene: SceneName): boolean => available.includes(scene),
    commit: (to: SceneName): void => {
      if (state.current === to || !available.includes(to)) {
        return;
      }
      state = {current: to};
      for (const l of Array.from(listeners)) {
        try {
          l();
        } catch (e) {
          console.error(e);
        }
      }
    },
  };
};

export type SceneManager = ReturnType<typeof createSceneManager>;
