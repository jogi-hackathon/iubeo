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

const POWER_OUTLINE_WIDTH = 7;
const POWER_WOBBLE_PX = 0;
const DILATE_TEXELS = 5;
const dilateResolutionScale = (pixelRatio: number): number =>
  Math.min(1, DILATE_TEXELS / (POWER_OUTLINE_WIDTH * pixelRatio));
const DASH_PERIODS_PER_SCREEN_HEIGHT = 45;
const DASH_SPEED = 1.5;
const EDGE_LOW = 0.3;
const EDGE_HIGH = 0.7;

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
  const dilateOptions = {resolutionScale: dilateResolutionScale(1)};
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
      const silhouette = visible.sample(screenUV).level(float(0)).a;
      const cover = coverXY.sample(screenUV).level(float(0)).r;
      edge.assign(
        smoothstep(EDGE_LOW, EDGE_HIGH, cover).mul(
          smoothstep(EDGE_LOW, EDGE_HIGH, silhouette).oneMinus(),
        ),
      );
    });
    return edge;
  })();

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
    composite: (
      color: Node<"vec4">,
      weight: Node<"float"> = float(1),
    ): Node<"vec4"> =>
      vec4(
        mix(
          color.rgb,
          powerOutlineColor,
          clamp(powerEdge, 0, 1).mul(dash).mul(powerOutlineFade).mul(weight),
        ),
        color.a,
      ),
    setPixelRatio: (pixelRatio: number): void => {
      const scale = dilateResolutionScale(pixelRatio);
      coverX.setResolutionScale(scale);
      coverXY.setResolutionScale(scale);
    },
    dispose: (): void => {
      coverX.dispose();
      coverXY.dispose();
    },
  };
};

export type PowerOutline = ReturnType<typeof createPowerOutline>;
