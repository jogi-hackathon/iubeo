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
const OUTLINE_THICKNESS = 1;
const EDGE_LOW = 0.3;
const EDGE_HIGH = 0.7;
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
    setPixelRatio: (pixelRatio: number): void => {
      thickness.value = OUTLINE_THICKNESS * pixelRatio;
    },
    dispose: (): void => {},
  };
};

export type AimOutline = ReturnType<typeof createAimOutline>;
