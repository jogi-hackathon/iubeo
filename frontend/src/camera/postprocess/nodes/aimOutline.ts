import {Color} from "three";
import {
  clamp,
  float,
  Fn,
  max,
  mix,
  screenSize,
  screenUV,
  uniform,
  vec2,
  vec4,
} from "three/tsl";
import type {Node} from "three/webgpu";

import type {SelectionMask} from "./selectionMask";

const OUTLINE_COLOR = "#1a1a1a";
/** アウトラインの太さ(マスクのテクセル。見えている部分をこの距離だけ外へ広げた輪が線になる。細めの線にするので 1.5) */
const OUTLINE_THICKNESS = 1.5;
const OUTLINE_STRENGTH = 4;
/** 広げる方向(8 方向、長さ 1) */
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
];

/**
 * 狙ったオブジェクトの外周(細い線)。選択は selectionMask の R(見えている部分)と B(全体のシルエット)を読む。
 * 見えている部分を 8 方向に OUTLINE_THICKNESS だけ広げ、シルエットの内側を除いた輪を線にする。
 * バイリニアで読むので輪の外側はなだらかに消える
 */
export const createAimOutline = (selection: SelectionMask) => {
  const {visible} = selection;
  const thickness = uniform(OUTLINE_THICKNESS);
  const outlineColor = uniform(new Color(OUTLINE_COLOR));
  const edge = Fn(() => {
    const texel = thickness.div(screenSize);
    const ring = float(0).toVar();
    for (const [dx, dy] of DIRECTIONS) {
      ring.assign(
        max(
          ring,
          visible.sample(screenUV.add(vec2(dx, dy).mul(texel))).level(float(0))
            .r,
        ),
      );
    }
    const silhouette = visible.sample(screenUV).level(float(0)).b;
    return ring.mul(silhouette.oneMinus());
  })();

  return {
    composite: (
      color: Node<"vec4">,
      weight: Node<"float"> = float(1),
    ): Node<"vec4"> =>
      vec4(
        mix(
          color.rgb,
          outlineColor,
          clamp(edge.mul(OUTLINE_STRENGTH), 0, 1).mul(weight),
        ),
        color.a,
      ),
    dispose: (): void => {},
  };
};

export type AimOutline = ReturnType<typeof createAimOutline>;
