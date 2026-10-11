import {
  abs,
  clamp,
  float,
  Fn,
  fract,
  If,
  max,
  mix,
  rtt,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  time,
  vec2,
  vec4,
} from "three/tsl";
import type {Node} from "three/webgpu";

import {
  powerOutlineColor,
  powerOutlineDash,
  powerOutlineFade,
} from "../powerOutlineSelection";
import type {SelectionMask} from "./selectionMask";

const POWER_OUTLINE_WIDTH = 10;
const POWER_WOBBLE_PX = 0;
const DILATE_RESOLUTION_SCALE = 0.5;
const DILATE_TEXELS = Math.round(POWER_OUTLINE_WIDTH * DILATE_RESOLUTION_SCALE);
const DASH_PERIODS_PER_SCREEN_HEIGHT = 45;
const DASH_SPEED = 1.5;

/**
 * 力の縁取り(選択物の外側に太い破線)。選択は selectionMask の G(見えている部分)と A(全体のシルエット)を読む
 */
export const createPowerOutline = (selection: SelectionMask) => {
  const {visible} = selection;
  const powerWobble = vec2(
    sin(screenUV.y.mul(90).add(time.mul(7))).add(
      sin(screenUV.y.mul(37).sub(time.mul(4.3))).mul(0.5),
    ),
    sin(screenUV.x.mul(80).add(time.mul(6.1))).add(
      sin(screenUV.x.mul(41).add(time.mul(3.7))).mul(0.5),
    ),
  )
    .mul(POWER_WOBBLE_PX / 1.5)
    .div(screenSize);
  const visibleSelectedAt = (dx: number, dy: number): Node<"float"> =>
    visible
      .sample(screenUV.add(powerWobble).add(vec2(dx, dy).div(screenSize)))
      .level(float(0)).g;
  // 円形に全方向を読むと 1 ピクセル 144 回のサンプルになり FPS が半分に落ちたので、横→縦の 2 パスの最大値で広げる(縁の角は四角くなる)。
  // 縁の内側はフル解像度のマスクで切るので、広げる側は半解像度で足りる。パスの中の screenSize は半解像度の大きさになる
  const dilateAlong = (
    sampleAt: (offset: number) => Node<"float">,
  ): Node<"vec4"> =>
    Fn(() => {
      const cover = sampleAt(0).toVar();
      If(powerOutlineFade.greaterThan(0).and(cover.lessThan(1)), () => {
        for (let offset = 1; offset <= DILATE_TEXELS; offset++) {
          cover.assign(max(cover, max(sampleAt(offset), sampleAt(-offset))));
        }
      });
      return vec4(cover, 0, 0, 1);
    })();
  const dilateOptions = {resolutionScale: DILATE_RESOLUTION_SCALE};
  const coverX = rtt(
    dilateAlong((dx) => visibleSelectedAt(dx, 0)),
    null,
    null,
    dilateOptions,
  );
  const coverXY = rtt(
    dilateAlong(
      (dy) =>
        coverX.sample(screenUV.add(vec2(0, dy).div(screenSize))).level(float(0))
          .r,
    ),
    null,
    null,
    dilateOptions,
  );
  const powerEdge = Fn(() => {
    const edge = float(0).toVar();
    If(powerOutlineFade.greaterThan(0), () => {
      // 広げた範囲から、選択物のシルエット全体(隠れた部分も)を除いて外側だけ残す
      const silhouette = visible.sample(screenUV).level(float(0)).a;
      edge.assign(
        coverXY.sample(screenUV).level(float(0)).r.mul(silhouette.oneMinus()),
      );
    });
    return edge;
  })();

  // 縁に沿った長さはポストプロセスでは取れないので、画面の斜め縞で代用する(縁が縞と平行な 45° の所は破線に見えない)
  // 画面の高さを基準にして、解像度や DPR が違っても見た目の細かさと速さをそろえる
  const aspect = screenSize.x.div(screenSize.y);
  const dashPhase = fract(
    screenUV.x
      .mul(aspect)
      .add(screenUV.y)
      .mul(DASH_PERIODS_PER_SCREEN_HEIGHT)
      .sub(time.mul(DASH_SPEED)),
  );
  const dashAa = screenSize.y.reciprocal().mul(DASH_PERIODS_PER_SCREEN_HEIGHT);
  const dashOn = smoothstep(
    float(0.25).sub(dashAa),
    float(0.25).add(dashAa),
    abs(dashPhase.sub(0.5)),
  );
  const dash = mix(float(1), dashOn, powerOutlineDash);

  return {
    composite: (color: Node<"vec4">): Node<"vec4"> =>
      vec4(
        mix(
          color.rgb,
          powerOutlineColor,
          clamp(powerEdge, 0, 1).mul(dash).mul(powerOutlineFade),
        ),
        color.a,
      ),
    /** 広げるパスの解像度を、シーンの内部解像度(pipeline の renderScale)に合わせる */
    setRenderScale: (renderScale: number): void => {
      coverX.setResolutionScale(DILATE_RESOLUTION_SCALE * renderScale);
      coverXY.setResolutionScale(DILATE_RESOLUTION_SCALE * renderScale);
    },
    dispose: (): void => {
      coverX.dispose();
      coverXY.dispose();
    },
  };
};

export type PowerOutline = ReturnType<typeof createPowerOutline>;
