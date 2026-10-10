import {gameFlow} from "../flow/store";
import type {SceneName} from "./index";

/**
 * シーンの準備が整ったと言える条件(シーンごとに型で決める。表の抜けはコンパイルで止まる)
 * - mount: マウントの effect まで済めば準備完了(物を置くオーソリティが無いシーン)
 * - authority: 窓口(オーソリティ。LocalAuthority・ServerAuthority)が登録されて、物が置かれてから準備完了(オーソリティが自分で知らせる)
 */
export type SceneReadiness = "authority" | "mount";

type ReadinessRule = SceneReadiness | (() => SceneReadiness);

export const sceneReadiness = {
  room: "authority",
  // セッションに入るとき(ゲームの流れが sandbox へ移すとき)は ServerAuthority が、
  // セッション無し(デバッグでの直接移動・ベイク)は建物だけなので、マウントで足りる。
  // SandboxScene がマウントで決める(captured)のと同じ値を、シーンの表示と同じ描画で読む
  sandbox: () => (gameFlow.currentSession() ? "authority" : "mount"),
  test: "authority",
} as const satisfies Record<SceneName, ReadinessRule>;

/** 今のシーンの準備の条件(App と bake が、mount のシーンにだけ ReportSceneReady を置くのに使う) */
export const readinessOf = (scene: SceneName): SceneReadiness => {
  const rule: ReadinessRule = sceneReadiness[scene];
  return typeof rule === "function" ? rule() : rule;
};
