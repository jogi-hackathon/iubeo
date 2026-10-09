import type {SceneName} from "./index";

/**
 * シーンの準備が整ったと言える条件(シーンごとに型で決める。表の抜けはコンパイルで止まる)
 * - mount: マウントの effect まで済めば準備完了(オブジェクトを持たないシーン)
 * - authority: 窓口(オーソリティ。LocalAuthority など)が登録されて、物が置かれてから準備完了(物を置くシーン)
 */
export type SceneReadiness = "authority" | "mount";

export const sceneReadiness = {
  room: "authority",
  sandbox: "mount",
  test: "authority",
  multiplayer: "mount",
} as const satisfies Record<SceneName, SceneReadiness>;
