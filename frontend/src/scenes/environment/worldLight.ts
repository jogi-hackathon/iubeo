import type {Vector3Tuple} from "three";

/**
 * 白い世界の光。WhiteWorld(R3F)と遷移用の proxyScene(素の three)で同じ値を使う。
 * 半球光が全体の明るさ、平行光が面の向きごとの陰影を作る。
 * ライトの数と種類はシェーダーに焼かれるので、値だけを変える(半球光 1 つ + 平行光 1 つ)
 */
export const WORLD_LIGHT = {
  hemisphere: {sky: "#ffffff", ground: "#b8b8b8", intensity: 1.8},
  sun: {color: "#ffffff", intensity: 1.4, position: [8, 10, 5] as Vector3Tuple},
} as const;
