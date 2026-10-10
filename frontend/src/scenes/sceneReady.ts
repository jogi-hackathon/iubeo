import type {SceneName} from "./index";

const ready = new Set<SceneName>();
const waiters = new Map<SceneName, Set<() => void>>();

/** シーンが描画されて準備できたことを知らせる(シーンのマウント後の effect から呼ぶ) */
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

/** 遷移のたびに、commit の前に呼ぶ。前の訪問での準備を無かったことにする */
export const resetSceneReady = (scene: SceneName): void => {
  ready.delete(scene);
};

/** シーンの準備ができたら resolve する(もう準備済みなら即 resolve) */
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
