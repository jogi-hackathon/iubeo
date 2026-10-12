import {Color} from "three";
import {
  dot,
  float,
  floor,
  Fn,
  int,
  max,
  mix,
  perspectiveDepthToViewZ,
  screenSize,
  screenUV,
  smoothstep,
  uniform,
  vec2,
  vec4,
} from "three/tsl";
import type {Node, TextureNode} from "three/webgpu";

import type {PostProcessSettings} from "../settings";

const LINE_COLOR = "#000000";

/**
 * 物の縁に引く細い輪郭線。AO の pre-pass の法線・深度(内部解像度)を読み、
 * - 深度: 隣のピクセルが相対的に奥(手前の物の輪郭)
 * - 法線: 隣のピクセルと向きが違う(折れ目)
 * のどちらかを線にする。深度は奥側だけ見るので線は手前の物の側に 1 ピクセル、法線は +x・+y だけ見て 1 ピクセルに保つ。
 * 画面の解像度(FSR1 の後)で重ね、隣は画面の 1 ピクセル先を見る。法線・深度は内部解像度のテクセルの中心に寄せて読む
 * (補間すると縁の値がなだらかになり、線が 1/renderScale ピクセルに広がって薄くなる)。
 * 遠くは線が密になって汚れるので、距離で薄くする。空(深度 1)は距離で消える
 */
export const createContour = (
  normal: TextureNode,
  depth: TextureNode,
  /** シーンのカメラの near / far(pipeline が毎フレーム入れる。TSL の cameraNear は後処理の中では quad のカメラの値になる) */
  camera: {near: Node<"float">; far: Node<"float">},
) => {
  const strength = uniform(0);
  const depthThreshold = uniform(0.02);
  const normalThreshold = uniform(0.25);
  const fadeStart = uniform(6);
  const fadeEnd = uniform(25);
  const lineColor = uniform(new Color(LINE_COLOR));

  const edge = Fn(() => {
    const texel = vec2(1).div(screenSize);
    // 法線と深度は同じ pre-pass なので大きさも同じ
    const sourceSize = vec2(depth.size(int(0)) as Node<"ivec2">);
    const snap = (offset: Node<"vec2">): Node<"vec2"> =>
      floor(screenUV.add(offset).mul(sourceSize)).add(0.5).div(sourceSize);
    const distanceAt = (offset: Node<"vec2">): Node<"float"> =>
      perspectiveDepthToViewZ(
        depth.sample(snap(offset)).level(float(0)).r,
        camera.near,
        camera.far,
      ).negate();
    const normalAt = (offset: Node<"vec2">): Node<"vec3"> =>
      normal.sample(snap(offset)).level(float(0)).xyz;

    const z0 = distanceAt(vec2(0)).toVar();
    const n0 = normalAt(vec2(0)).toVar();

    // 隣が奥にあるほど大きい(手前にあるときは 0)。z0 で割って距離によらない比にする
    const depthStep = float(0).toVar();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const z = distanceAt(vec2(dx, dy).mul(texel));
      depthStep.assign(max(depthStep, z.sub(z0).div(z0)));
    }
    const normalStep = float(0).toVar();
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      const n = normalAt(vec2(dx, dy).mul(texel));
      normalStep.assign(max(normalStep, dot(n0, n).oneMinus()));
    }

    const line = max(
      smoothstep(depthThreshold, depthThreshold.mul(2), depthStep),
      smoothstep(normalThreshold, normalThreshold.mul(2), normalStep),
    );
    const fade = smoothstep(fadeStart, fadeEnd, z0).oneMinus();
    return line.mul(fade).mul(strength);
  })();

  return {
    composite: (
      color: Node<"vec4">,
      weight: Node<"float"> = float(1),
    ): Node<"vec4"> =>
      vec4(mix(color.rgb, lineColor, edge.mul(weight)), color.a),
    apply: (s: PostProcessSettings["contour"]): void => {
      strength.value = s.strength;
      depthThreshold.value = s.depthThreshold;
      normalThreshold.value = s.normalThreshold;
      fadeStart.value = s.fadeStart;
      fadeEnd.value = Math.max(s.fadeEnd, s.fadeStart + 0.01);
    },
  };
};

export type Contour = ReturnType<typeof createContour>;
