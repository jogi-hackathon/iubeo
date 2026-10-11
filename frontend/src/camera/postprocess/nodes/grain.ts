import {Fn, screenSize, screenUV, time, uniform, vec4} from "three/tsl";
import type {Node} from "three/webgpu";

import {cellHash} from "../../../core/cellHash";

/** 1 秒に何回ノイズを置き換えるか(フィルムのコマ) */
const STEPS_PER_SECOND = 24;

/**
 * フィルムグレイン。画面の解像度で、画素ごとに ±amount/2 の一様ノイズを足す。
 * 白→灰のなだらかなグラデーションが 8bit に量子化されて出る縞(バンディング)を散らすディザも兼ねる
 * (amount が 1/255 以上なら、量子化の段差がノイズに埋もれる)
 */
export const createGrain = () => {
  const amount = uniform(0);
  const noise = Fn(() =>
    cellHash(
      screenUV.mul(screenSize).floor(),
      time.mul(STEPS_PER_SECOND).floor(),
      11,
    ).sub(0.5),
  )();

  return {
    composite: (color: Node<"vec4">): Node<"vec4"> =>
      vec4(color.rgb.add(noise.mul(amount)), color.a),
    apply: (value: number): void => {
      amount.value = value;
    },
  };
};

export type Grain = ReturnType<typeof createGrain>;
