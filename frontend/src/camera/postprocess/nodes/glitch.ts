import {
  dot,
  float,
  Fn,
  floor,
  fract,
  If,
  mix,
  screenUV,
  sin,
  step,
  time,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type {Node, TextureNode} from "three/webgpu";

import {glitchStrength} from "../glitchState";

const BANDS = 28;
const STEPS_PER_SECOND = 30;
const BAND_DENSITY = 0.55;
const MAX_SHIFT = 0.16;
const GHOST = 0.006;
const LUMA = vec3(0.299, 0.587, 0.114);

const rand = (x: Node<"float">): Node<"float"> =>
  fract(sin(x.mul(12.9898)).mul(43758.5453));

export const createGlitch = () => ({
  scene: (sceneColor: TextureNode): Node<"vec4"> =>
    Fn(() => {
      const result = vec4(0).toVar();
      result.assign(sceneColor);
      If(glitchStrength.greaterThan(0), () => {
        const band = floor(screenUV.y.mul(BANDS)).add(
          floor(time.mul(STEPS_PER_SECOND)).mul(17),
        );
        const active = step(
          float(1).sub(glitchStrength.mul(BAND_DENSITY)),
          rand(band),
        );
        const shift = rand(band.add(91.7))
          .sub(0.5)
          .mul(MAX_SHIFT)
          .mul(glitchStrength)
          .mul(active);
        const uvShifted = vec2(screenUV.x.add(shift), screenUV.y);
        const lumaAt = (offset: number) =>
          dot(
            sceneColor.sample(uvShifted.add(vec2(offset, 0))).level(float(0))
              .rgb,
            LUMA,
          );
        const gray = lumaAt(GHOST).add(lumaAt(-GHOST)).mul(0.5);
        const original = sceneColor.sample(screenUV).level(float(0));
        result.assign(vec4(mix(original.rgb, vec3(gray), active), original.a));
      });
      return result;
    })(),
});

export type Glitch = ReturnType<typeof createGlitch>;
