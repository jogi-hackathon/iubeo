import {sceneNames, spawnOf} from ".";
import {
  coverScreen,
  showBarWhileWaiting,
  uncoverScreen,
} from "../core/cover/cover";
import {coverStore} from "../core/cover/coverStore";
import {DEBUG_REQUESTED} from "../core/debug/flags";
import {lockPlayerControl} from "../core/playerControl";
import {overview} from "../objects/directory/overview";
import {pcSession} from "../objects/pc/session";
import {localPlayer} from "../player/local";
import {createSceneManager} from "./sceneManager";
import {resetSceneReady, whenSceneReady} from "./sceneReady";
import {createSceneTransitionManager} from "./sceneTransitionManager";
import {applySpawn} from "./spawn";

// import.meta.env を触るのはここと index.ts だけ。sceneManager.ts・sceneTransitionManager.ts は純粋に保つ(テスト容易性のため)。
// 既定は room。開発時に ?debug を付けたとき(VITE_ENABLE_DEBUG=true が前提)だけ、確認用の test から始める
const initial = import.meta.env.DEV && DEBUG_REQUESTED ? "test" : "room";

/** 今のシーン(App が描画する) */
export const sceneManager = createSceneManager({
  initial,
  available: sceneNames,
});

// 遷移の間(覆ってから外すまで)プレイヤーの移動・視点・インタラクトを止める(覆いの裏で歩き出したり、物に触ったりしない)
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
  waitReady: (scene) => showBarWhileWaiting(whenSceneReady(scene)),
  finishTransition: () => {
    uncoverScreen();
    releaseTransitionLock?.();
    releaseTransitionLock = null;
  },
  canStart: () => !coverStore.getState().booting,
});

// commit の直前に、to の準備済みの印を外す(前の訪問で準備済みでも、今回のマウントを待つ)
sceneTransitionManager.onPrepare(({to}) => resetSceneReady(to));

// 起動時の位置も、最初のシーンのスポーン地点に合わせる
applySpawn(localPlayer, spawnOf(initial));

// 出るシーンの後始末。俯瞰ビューの解除(プレイヤーの預かりが外れる)。
// 作業中のロック(useControlLockWhileWorking)は、オブジェクトとシーンのアンマウントで自然に外れる
sceneTransitionManager.onLeave(() => overview.reset());
// PC を使っている途中なら、そのまま離す(プレイヤーを返し、画面の電源を切る)
sceneTransitionManager.onLeave(() => pcSession.reset());

// 入ったシーンのスポーン地点へ戻す
sceneTransitionManager.onEnter(({to}) => applySpawn(localPlayer, spawnOf(to)));
