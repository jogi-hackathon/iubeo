import {
  abs,
  clamp,
  color,
  cos,
  float,
  floor,
  Fn,
  fract,
  hash,
  instanceIndex,
  max,
  mix,
  pow,
  sin,
  smoothstep,
  step,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import {type Node, SpriteNodeMaterial} from "three/webgpu";

import {CORRUPTION_RED_DARK, CORRUPTION_RED_LIGHT} from "./corruption";
import {MOUNTAIN_SIZES, type MountainSizeName} from "./mountain";

/** 山の大きさごとの、炎の粒の置き方 */
export type FireParams = {
  /** 粒の数 */
  count: number;
  /** 粒が出る山の表面の、底面と上面の半径(m)と、上面の高さ(m)。山の形(mountain.ts)より少し内側・低めにする */
  radiusBottom: number;
  radiusTop: number;
  height: number;
  /** 粒の大きさ(高さ、m)の範囲 */
  sizeMin: number;
  sizeMax: number;
  /** 粒が寿命の間に昇る高さ(m)の範囲 */
  riseMin: number;
  riseMax: number;
  /** 位置と大きさを揃えるグリッドの 1 辺(m) */
  grid: number;
};

const SURFACE_INSET = 0.9;
const SIZE_RATIO = [0.055, 0.11] as const;
const RISE_RATIO = [0.11, 0.26] as const;
const GRID_RATIO = 0.016;
const COUNTS: Record<MountainSizeName, number> = {large: 420, small: 160};

/** 山の大きさから、炎の粒の置き方を決める */
export const fireParamsFor = (size: MountainSizeName): FireParams => {
  const m = MOUNTAIN_SIZES[size];
  const height = m.heightMin;
  return {
    count: COUNTS[size],
    radiusBottom: m.radiusBottom * SURFACE_INSET,
    radiusTop: m.radiusTop * SURFACE_INSET,
    height: height * SURFACE_INSET,
    sizeMin: height * SIZE_RATIO[0],
    sizeMax: height * SIZE_RATIO[1],
    riseMin: height * RISE_RATIO[0],
    riseMax: height * RISE_RATIO[1],
    grid: height * GRID_RATIO,
  };
};

/** 火がついてから、すべての粒が燃えるまで(秒) */
export const IGNITE_SECONDS = 2;
const LIFE_MIN = 0.9;
const LIFE_MAX = 1.7;

const STEP_FPS = 12;
const COLOR_LEVELS = 3;
const RIM_RATIO = 0.22;
const FIRE_RIM = color("#3a0a10");

export type FireMaterial = {
  material: SpriteNodeMaterial;
  /** 火のつき具合(0〜1)。燃える粒の割合 */
  ignition: {value: number};
};

const snapFloat = (v: Node<"float">, g: number): Node<"float"> =>
  floor(v.div(g).add(0.5)).mul(g);
const snapVec3 = (v: Node<"vec3">, g: number): Node<"vec3"> =>
  floor(v.div(g).add(0.5)).mul(g);

/** 炎の粒のマテリアルを作る(山の大きさごと)。使い終わったら material.dispose() */
export const createFireMaterial = (params: FireParams): FireMaterial => {
  const ignition = uniform(0);
  const id = instanceIndex.toFloat();
  const steppedTime = floor(time.mul(STEP_FPS)).div(STEP_FPS);
  const life = mix(float(LIFE_MIN), float(LIFE_MAX), hash(id.add(11)));
  const age = steppedTime.add(hash(id.add(23)).mul(life)).div(life);
  const t = fract(age);
  const seed = id.add(floor(age).mul(1013));

  const material = new SpriteNodeMaterial();
  material.positionNode = snapVec3(
    Fn(() => {
      const h = pow(hash(seed.add(1)), float(1.4));
      const angle = hash(seed.add(2)).mul(Math.PI * 2);
      const r = mix(float(params.radiusBottom), float(params.radiusTop), h).mul(
        mix(float(0.8), float(1), hash(seed.add(3))),
      );
      const rise = mix(
        float(params.riseMin),
        float(params.riseMax),
        hash(seed.add(4)),
      ).mul(t);
      return vec3(
        cos(angle).mul(r),
        h.mul(params.height).add(rise),
        sin(angle).mul(r),
      );
    })(),
    params.grid,
  );
  const lit = step(hash(id.add(31)), ignition);
  const size = snapFloat(
    mix(float(params.sizeMin), float(params.sizeMax), hash(seed.add(5)))
      .mul(smoothstep(0, 0.12, t))
      .mul(pow(float(1).sub(t), float(0.8))),
    params.grid,
  ).mul(lit);
  material.scaleNode = vec2(size, size);

  const p = uv().mul(2).sub(1);
  const inner = step(max(abs(p.x), abs(p.y)), float(1 - RIM_RATIO));
  const level = floor(t.mul(COLOR_LEVELS)).div(COLOR_LEVELS - 1);
  material.colorNode = mix(
    FIRE_RIM,
    mix(CORRUPTION_RED_LIGHT, CORRUPTION_RED_DARK, clamp(level, 0, 1)),
    inner,
  );
  // SpriteNodeMaterial は既定で transparent なので、GTAO の pre-pass にも入らない(setSkipGTAO は要らない)

  return {material, ignition};
};
