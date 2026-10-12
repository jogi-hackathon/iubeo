import {Color} from "three";
import {
  clamp,
  float,
  Fn,
  max,
  mix,
  screenSize,
  smoothstep,
  screenUV,
  uniform,
  vec2,
  vec4,
} from "three/tsl";
import type {Node} from "three/webgpu";

import type {SelectionMask} from "./selectionMask";

const OUTLINE_COLOR = "#1a1a1a";
/**
 * アウトラインの太さ(CSS ピクセル。見えている部分をこの距離だけ外へ広げた輪が線になる)。
 * 描画バッファのピクセルにすると高 DPR の画面で細くなりすぎ、内部解像度のマスクのテクセルより細い線は途切れる
 */
const OUTLINE_THICKNESS = 1;
/**
 * マスクは内部解像度なので、画面の解像度でバイリニアに読むと縁が 1/renderScale ピクセルかけてなだらかに変わる。
 * 0.5 の前後だけを拾って縁を締める(線の幅は解像度によらず、縁は 1 ピクセル弱のアンチエイリアスになる)
 */
const EDGE_LOW = 0.3;
const EDGE_HIGH = 0.7;
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
 * 画面の解像度(FSR1 の後)で重ねる前提で、screenSize は画面の大きさ
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
    return smoothstep(EDGE_LOW, EDGE_HIGH, ring).mul(
      smoothstep(EDGE_LOW, EDGE_HIGH, silhouette).oneMinus(),
    );
  })();

  return {
    composite: (
      color: Node<"vec4">,
      weight: Node<"float"> = float(1),
    ): Node<"vec4"> =>
      vec4(
        mix(color.rgb, outlineColor, clamp(edge, 0, 1).mul(weight)),
        color.a,
      ),
    /** 描画バッファの CSS ピクセルに対する比(renderer.getPixelRatio) */
    setPixelRatio: (pixelRatio: number): void => {
      thickness.value = OUTLINE_THICKNESS * pixelRatio;
    },
    dispose: (): void => {},
  };
};

export type AimOutline = ReturnType<typeof createAimOutline>;
