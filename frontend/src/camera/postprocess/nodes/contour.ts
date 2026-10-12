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

export const createContour = (
  normal: TextureNode,
  depth: TextureNode,
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
