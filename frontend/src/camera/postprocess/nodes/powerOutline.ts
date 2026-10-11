import type {Camera, Scene} from "three";
import {outline} from "three/addons/tsl/display/OutlineNode.js";
import {
  abs,
  clamp,
  float,
  Fn,
  fract,
  If,
  max,
  mix,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  texture,
  time,
  vec2,
  vec4,
} from "three/tsl";
import type {Node, RenderTarget} from "three/webgpu";

import {
  powerOutlineColor,
  powerOutlineDash,
  powerOutlineFade,
  powerOutlineSelection,
} from "../powerOutlineSelection";

const POWER_OUTLINE_WIDTH = 10;
const POWER_WOBBLE_PX = 0;
const DASH_PERIODS_PER_SCREEN_HEIGHT = 45;
const DASH_SPEED = 1.5;

export const createPowerOutline = (scene: Scene, camera: Camera) => {
  // 選択が空のあいだは OutlineNode が自分のパスを全部飛ばすので、狙いの縁取りと同じくグラフには常に入れておく
  const powerOutlinePass = outline(scene, camera, {
    selectedObjects: powerOutlineSelection,
    edgeGlow: float(0),
  });
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
  // OutlineNode のマスクは、r が選んだ物の上で 0(それ以外は 1)、g が選んだ物が他の物の深さより奥のとき 1(見えているのは 0)。
  // 公開されていない中身(_renderTargetMaskBuffer)なので、three を上げたときは名前と中身が変わっていないか確かめる
  const powerMask = texture(
    (powerOutlinePass as unknown as {_renderTargetMaskBuffer: RenderTarget})
      ._renderTargetMaskBuffer.texture,
  );
  const visibleSelectedAt = (dx: number, dy: number): Node<"float"> => {
    const m = powerMask
      .sample(screenUV.add(powerWobble).add(vec2(dx, dy).div(screenSize)))
      .level(float(0));
    return m.g.oneMinus().mul(m.r.oneMinus());
  };
  const powerEdge = Fn(() => {
    const edge = float(0).toVar();
    If(powerOutlineFade.greaterThan(0), () => {
      const cover = float(0).toVar();
      for (let radius = 1; radius <= POWER_OUTLINE_WIDTH; radius++) {
        const directions = radius <= 2 ? 8 : 16;
        for (let k = 0; k < directions; k++) {
          const angle = (k / directions) * Math.PI * 2;
          cover.assign(
            max(
              cover,
              visibleSelectedAt(
                radius * Math.cos(angle),
                radius * Math.sin(angle),
              ),
            ),
          );
        }
      }
      edge.assign(cover.mul(powerMask.sample(screenUV).level(float(0)).r));
    });
    // OutlineNode はグラフに入れないとマスクを毎フレーム更新しないので、結果に影響しない形(0 倍)でつなぐ
    return edge.add(powerOutlinePass.visibleEdge.mul(0));
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
    dispose: (): void => {
      powerOutlinePass.dispose();
    },
  };
};

export type PowerOutline = ReturnType<typeof createPowerOutline>;
