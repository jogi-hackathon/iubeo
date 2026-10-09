import {sceneNames, spawnOf} from ".";
import {DEBUG_REQUESTED} from "../core/debug/flags";
import {overview} from "../objects/directory/overview";
import {pcSession} from "../objects/pc/session";
import {localPlayer} from "../player/local";
import {createSceneManager} from "./sceneManager";
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

/** シーンの切り替えの流れ(goTo・遷移中の状態・フック)。切り替えの結果は sceneManager に commit される */
export const sceneTransitionManager = createSceneTransitionManager({
  sceneManager,
});

// 起動時の位置も、最初のシーンのスポーン地点に合わせる
applySpawn(localPlayer, spawnOf(initial));

// 出るシーンの後始末。俯瞰ビューの解除(プレイヤーの預かりが外れる)。
// 作業中のロック(useObjectControlLock)は、オブジェクトとシーンのアンマウントで自然に外れる
sceneTransitionManager.onLeave(() => overview.reset());
// PC を使っている途中なら、そのまま離す(プレイヤーを返し、画面の電源を切る)
sceneTransitionManager.onLeave(() => pcSession.reset());

// 入ったシーンのスポーン地点へ戻す
sceneTransitionManager.onEnter(({to}) => applySpawn(localPlayer, spawnOf(to)));
