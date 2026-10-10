import {
  clamp,
  color,
  float,
  floor,
  hash,
  mix,
  positionWorld,
  screenCoordinate,
  select,
  step,
  time,
  uint,
  uniform,
  vec2,
  vec4,
} from "three/tsl";
import type {Node, NodeMaterial} from "three/webgpu";

/** 侵食の値。progress は DirectoryFire が、baseY・height は useDirectory が書く */
export const directoryCorruption = {
  /** 進み具合(0: 侵食なし、1: すべて抜けた) */
  progress: uniform(0),
  /** 山の足元の高さ(ワールド) */
  baseY: uniform(0),
  /** 山の高さ(m) */
  height: uniform(5),
};

/** 火がついてから、山がすべて抜けるまで(秒)。サーバーは火がついてから 10 秒で決着するので、それより短く */
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

/** 赤の階調(暗い → 明るい)と、潰れた白 */
export const CORRUPTION_RED_DARK = color("#7a1020");
export const CORRUPTION_RED_LIGHT = color("#e04656");
const RED_LEVELS = 3;
const COLLAPSED = color("#f4f2ee");

// 種は uint で組む(f32 だと隣のセルの種が潰れて、横に揃った模様になる)
const cellHash = (
  cell: Node<"vec2">,
  step: Node<"float">,
  n: number,
): Node<"float"> =>
  hash(
    cell.x
      .toUint()
      .add(cell.y.toUint().mul(uint(4099)))
      .add(step.toUint().mul(uint(65537)))
      .add(uint(n * 7919)),
  );

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

/**
 * マテリアルに侵食を重ねる。base は元の色(侵食前)。
 * 侵食中は赤、半ばを過ぎると白く潰れ、最後に抜ける(opacity 0 を alphaTest で捨てる)。
 * 火がつく前からマテリアルに入れておく(つけた瞬間にシェーダーが作り直され、カクつくため)
 */
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
