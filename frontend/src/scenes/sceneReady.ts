import type {SceneName} from "./index";

const ready = new Set<SceneName>();
const waiters = new Map<SceneName, Set<() => void>>();

export const markSceneReady = (scene: SceneName): void => {
  ready.add(scene);
  const list = waiters.get(scene);
  if (!list) {
    return;
  }
  waiters.delete(scene);
  for (const resolve of Array.from(list)) {
    resolve();
  }
};

export const resetSceneReady = (scene: SceneName): void => {
  ready.delete(scene);
};

export const whenSceneReady = (scene: SceneName): Promise<void> => {
  if (ready.has(scene)) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const list = waiters.get(scene) ?? new Set<() => void>();
    list.add(resolve);
    waiters.set(scene, list);
  });
};
