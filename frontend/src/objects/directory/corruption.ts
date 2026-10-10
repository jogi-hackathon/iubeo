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

/*
 * ディレクトリが燃える演出の「侵食」。燃えるを「IUBEO の外の色(赤)に侵食され、データとして圧縮・劣化して消える」として描く。
 * 空(scenes/environment/skybox.ts)と同じ言葉で描く: 画面に揃ったブロック(8px と 20px)と、段々に潰れた階調。
 *
 * 山の表面を画面のブロックで区切り、下から上へ進む前線と、ブロックごとの乱数を比べて、ブロックごとに 3 段階で進める。
 * 1. 赤に侵食される(赤の階調は段々に潰し、時間で段を切り替えてちらつかせる)
 * 2. 白く潰れる(圧縮でブロックが平らになる)
 * 3. 抜けて消える(discard。山の向こうが見える)
 * 進み具合(progress)は、火がついている間 DirectoryFire が 0 → 1 へ進め、外れると 0 に戻す。0 の間は元の色のまま。
 * 処理は紙・芯・成果物の板のマテリアルにふだんから入れておく(火がついた瞬間にシェーダーを作り直してカクつかないように)。
 * シーンにディレクトリは 1 つなので、値は共有の uniform にする
 */

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

/** ブロックの 1 辺(px)。空の第 1・2 層と同じ */
const FINE_BLOCK = 8;
const COARSE_BLOCK = 20;
/** 大きいブロックで区切る領域の割合 */
const COARSE_RATIO = 0.4;
/** 高さを何段に潰すか(ブロックの中で前線がなめらかに通らないよう、段にする) */
const HEIGHT_BANDS = 12;
/** 前線の進み方に効く、高さとブロックの乱数の割合(乱数が大きいほど、ばらばらに侵食される) */
const HEIGHT_WEIGHT = 0.65;
const JITTER_WEIGHT = 0.35;
/** ブロックが侵食されてから抜けきるまでの、前線の幅 */
const STAGE_WIDTH = 0.3;
/** 赤の段がちらつく速さ(1 秒あたりの切り替え) */
const FLICKER_STEPS = 6;
/** ちらつくブロックの割合 */
const FLICKER_RATIO = 0.3;

/** 赤の階調(暗い → 明るい)と、潰れた白 */
export const CORRUPTION_RED_DARK = color("#7a1020");
export const CORRUPTION_RED_LIGHT = color("#e04656");
const RED_LEVELS = 3;
const COLLAPSED = color("#f4f2ee");

/**
 * 乱数(0〜1)。cell ごと・step(時間)ごと・n(用途)ごとに系列を分ける。空(skybox.ts)の cellHash と同じ組み方
 * (種を uint で組み、f32 で隣のセルの種が潰れて横に揃った模様になるのを避ける)
 */
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

/** 画面のブロック。一部の領域は大きいブロックにする */
const block: Node<"vec2"> = (() => {
  const fine = floor(screenCoordinate.xy.div(FINE_BLOCK));
  const coarse = floor(screenCoordinate.xy.div(COARSE_BLOCK));
  return select(
    cellHash(coarse, float(0), 1).lessThan(COARSE_RATIO),
    coarse.add(vec2(100000, 0)),
    fine,
  );
})();

/** このブロックの段階(0: 侵食前、0〜1: 侵食中、1 で抜ける)。下から上へ、ブロックごとにばらつかせて進む */
const stage: Node<"float"> = (() => {
  const {progress, baseY, height} = directoryCorruption;
  const h = clamp(positionWorld.y.sub(baseY).div(height), 0, 1);
  const banded = floor(h.mul(HEIGHT_BANDS)).div(HEIGHT_BANDS);
  const threshold = banded
    .mul(HEIGHT_WEIGHT)
    .add(cellHash(block, float(0), 2).mul(JITTER_WEIGHT));
  // progress が 1 のとき、一番遅いブロック(threshold 1)も抜けきるよう、前線を STAGE_WIDTH だけ先へ伸ばす
  const front = progress.mul(1 + STAGE_WIDTH);
  return clamp(front.sub(threshold).div(STAGE_WIDTH), 0, 1);
})();

/** 侵食された赤。ブロックごとに段々の階調で、一部のブロックは時間で段を切り替える */
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
 * 侵食中は赤、半ばを過ぎると白く潰れ、最後に抜ける(opacity 0 を alphaTest で捨てる)
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
  // 抜ける所はブロックごとにずらす(同じ段でも一斉に抜けない)
  const gone = step(
    float(0.8).add(cellHash(block, float(0), 5).mul(0.19)),
    stage,
  );
  material.opacityNode = float(1).sub(gone);
  material.alphaTest = 0.5;
};
