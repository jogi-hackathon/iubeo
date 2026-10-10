import {sceneNames, spawnOf} from ".";
import {
  coverScreen,
  showBarWhileWaiting,
  uncoverScreen,
} from "../core/cover/cover";
import {coverStore} from "../core/cover/coverStore";
import {DEBUG_REQUESTED} from "../core/debug/flags";
import {lockPlayerControl} from "../core/playerControl";
import {warmupShaders} from "../core/ShaderWarmup";
import {bindNavigator} from "../flow/store";
import {overview} from "../objects/directory/overview";
import {pcSession} from "../objects/pc/session";
import {localPlayer} from "../player/local";
import {createSceneManager} from "./sceneManager";
import {resetSceneReady, whenSceneReady} from "./sceneReady";
import {createSceneTransitionManager} from "./sceneTransitionManager";
import {applySpawn} from "./spawn";

const initial = import.meta.env.DEV && DEBUG_REQUESTED ? "test" : "room";

/** 今のシーン(App が描画する) */
export const sceneManager = createSceneManager({
  initial,
  available: sceneNames,
});

let releaseTransitionLock: (() => void) | null = null;

/**
 * シーンの切り替えの流れ(goTo・遷移中の状態・フック)。切り替えの結果は sceneManager に commit される。
 * 白い覆いで隠してから切り替え、新しいシーンの準備(ReportSceneReady)が終わったら覆いを外す。
 * 起動の覆いの間は、遷移を始めない(覆いを取り合わない)
 */
export const sceneTransitionManager = createSceneTransitionManager({
  sceneManager,
  runTransition: () => {
    releaseTransitionLock = lockPlayerControl();
    return coverScreen();
  },
  // 準備ができたら、覆いを外す前に新しいシーンのシェーダーを作らせる(初めて視界に入ったときのカクつきを避ける)
  waitReady: (scene) =>
    showBarWhileWaiting(whenSceneReady(scene).then(warmupShaders)),
  finishTransition: () => {
    uncoverScreen();
    releaseTransitionLock?.();
    releaseTransitionLock = null;
  },
  canStart: () => !coverStore.getState().booting,
});

sceneTransitionManager.onPrepare(({to}) => resetSceneReady(to));

applySpawn(localPlayer, spawnOf(initial));

sceneTransitionManager.onLeave(() => overview.reset());
sceneTransitionManager.onLeave(() => pcSession.reset());

sceneTransitionManager.onEnter(({to}) => applySpawn(localPlayer, spawnOf(to)));

const canTransition = (): boolean =>
  sceneTransitionManager.getState().status === "idle" &&
  !coverStore.getState().booting;

const whenCanTransition = async (): Promise<void> => {
  while (!canTransition()) {
    await new Promise<void>((resolve) => {
      const done = () => {
        offTransition();
        offCover();
        resolve();
      };
      const offTransition = sceneTransitionManager.subscribe(done);
      const offCover = coverStore.subscribe(done);
    });
  }
  await Promise.resolve();
  if (!canTransition()) {
    await whenCanTransition();
  }
};

bindNavigator({
  enter: async (scene) => {
    await whenCanTransition();
    if (sceneManager.getState().current === scene) {
      throw new Error(`既に ${scene} にいるので、移れません`);
    }
    await sceneTransitionManager.goTo(scene);
  },
});
