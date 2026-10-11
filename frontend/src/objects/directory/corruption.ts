import {
  clamp,
  color,
  float,
  floor,
  mix,
  positionWorld,
  screenCoordinate,
  select,
  step,
  time,
  uniform,
  vec2,
  vec4,
} from "three/tsl";
import type {Node, NodeMaterial} from "three/webgpu";

import {cellHash} from "../../core/cellHash";

export const directoryCorruption = {
  progress: uniform(0),
  baseY: uniform(0),
  height: uniform(5),
};

export const CORRUPT_SECONDS = 8;

const FINE_BLOCK = 8;
const COARSE_BLOCK = 20;
const COARSE_RATIO = 0.4;
const HEIGHT_BANDS = 12;
const HEIGHT_WEIGHT = 0.65;
const JITTER_WEIGHT = 0.35;
const STAGE_WIDTH = 0.3;
const FLICKER_STEPS = 6;
const FLICKER_RATIO = 0.3;

export const CORRUPTION_RED_DARK = color("#7a1020");
export const CORRUPTION_RED_LIGHT = color("#e04656");
const RED_LEVELS = 3;
const COLLAPSED = color("#f4f2ee");

const block: Node<"vec2"> = (() => {
  const fine = floor(screenCoordinate.xy.div(FINE_BLOCK));
  const coarse = floor(screenCoordinate.xy.div(COARSE_BLOCK));
  return select(
    cellHash(coarse, float(0), 1).lessThan(COARSE_RATIO),
    coarse.add(vec2(100000, 0)),
    fine,
  );
})();

const stage: Node<"float"> = (() => {
  const {progress, baseY, height} = directoryCorruption;
  const h = clamp(positionWorld.y.sub(baseY).div(height), 0, 1);
  const banded = floor(h.mul(HEIGHT_BANDS)).div(HEIGHT_BANDS);
  const threshold = banded
    .mul(HEIGHT_WEIGHT)
    .add(cellHash(block, float(0), 2).mul(JITTER_WEIGHT));
  const front = progress.mul(1 + STAGE_WIDTH);
  return clamp(front.sub(threshold).div(STAGE_WIDTH), 0, 1);
})();

const corruptedRed: Node<"vec3"> = (() => {
  const flickers = cellHash(block, float(0), 3).lessThan(FLICKER_RATIO);
  const tick = select(flickers, floor(time.mul(FLICKER_STEPS)), float(0));
  const level = floor(cellHash(block, tick, 4).mul(RED_LEVELS)).div(
    RED_LEVELS - 1,
  );
  return mix(CORRUPTION_RED_DARK, CORRUPTION_RED_LIGHT, clamp(level, 0, 1));
})();

export const applyCorruption = (
  material: NodeMaterial,
  base: Node<"vec3">,
): void => {
  const infected = stage.greaterThan(0);
  const collapsed = stage.greaterThan(0.55);
  const rgb = select(
    collapsed,
    COLLAPSED.rgb,
    select(infected, corruptedRed, base),
  );
  material.colorNode = vec4(rgb, 1);
  const gone = step(
    float(0.8).add(cellHash(block, float(0), 5).mul(0.19)),
    stage,
  );
  material.opacityNode = float(1).sub(gone);
  material.alphaTest = 0.5;
};
