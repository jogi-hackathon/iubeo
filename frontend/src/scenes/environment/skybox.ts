import {
  cameraProjectionMatrixInverse,
  cameraWorldMatrix,
  color,
  cos,
  float,
  floor,
  fract,
  hash,
  max,
  min,
  mix,
  mod,
  pow,
  screenCoordinate,
  screenSize,
  select,
  smoothstep,
  time,
  uint,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type {Node} from "three/webgpu";

import type {PostProcessSettings} from "../../camera/postprocess/settings";

/** 地平線の色。フォグと同じにして、遠景が空に継ぎ目なく溶けるようにする */
export const SKY_HORIZON = "#ffffff";
const SKY_ZENITH = "#d9d9d9";
const SKY_BANDS = 28;
const BAND_AMOUNT = 0.9;
const BLOCK_SIZES = [8, 20, 44] as const;
const LAYER_MAX = 6.2;
/** 仰角の幅の下限(度)。start == end だと smoothstep の edge0 == edge1 になる */
const MIN_ELEVATION_RANGE = 1;

const skyGradient = (dirY: Node<"float">): Node<"float"> =>
  pow(max(dirY, 0), 1.15);

const skyColor = (dirY: Node<"float">): Node<"vec3"> => {
  const g = skyGradient(dirY);
  const banded = mix(g, floor(g.mul(SKY_BANDS)).div(SKY_BANDS), BAND_AMOUNT);
  return mix(color(SKY_HORIZON), color(SKY_ZENITH), banded);
};

const rayDirection = (px: Node<"vec2">): Node<"vec3"> => {
  const ndc = px.div(screenSize).mul(2).sub(1).mul(vec2(1, -1));
  const view = cameraProjectionMatrixInverse.mul(vec4(ndc, 1, 1));
  return cameraWorldMatrix.mul(vec4(view.xyz.div(view.w), 0)).xyz.normalize();
};

/**
 * 乱数(0〜1)。cell ごと・step(時間)ごと・n(用途)ごとに系列を分ける。
 * 種は uint で組む(f32 だと 2^24 を超えたところで隣のセルの種が同じ値に潰れ、横に揃った模様になる。uint は桁あふれで回るだけ)
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

const dcOffset = (
  px: Node<"vec2">,
  size: Node<"float">,
  step: Node<"float">,
  seed: number,
): Node<"float"> => cellHash(floor(px.div(size)), step, seed).sub(0.5);

const dctBlock = (
  px: Node<"vec2">,
  size: Node<"float">,
  step: Node<"float">,
  seed: number,
): Node<"float"> => {
  const cell = floor(px.div(size));
  const f = fract(px.div(size)).mul(Math.PI);
  const r = (k: number) => cellHash(cell, step, seed + k).sub(0.5);
  return r(0)
    .mul(cos(f.x).mul(cos(f.y)))
    .add(r(1).mul(cos(f.x.mul(2))))
    .add(r(2).mul(cos(f.y.mul(2))))
    .add(r(3).mul(cos(f.x.mul(3)).mul(cos(f.y.mul(2)))));
};

export interface Skybox {
  /** scene.backgroundNode に設定する */
  node: Node<"vec3">;
  /** 設定を uniform に反映する(再コンパイルは起きない) */
  apply(settings: PostProcessSettings): void;
}

const createSkybox = (): Skybox => {
  const u = {
    enabled: uniform(1),
    intensity: uniform(1),
    blockSize1: uniform(8),
    blockSize2: uniform(20),
    blockSize3: uniform(44),
    elevationStart: uniform(0),
    elevationEnd: uniform(1),
    updateRate: uniform(2),
  };

  const px = screenCoordinate.xy;
  const dir = rayDirection(px);
  const layerAt = (dirY: Node<"float">): Node<"float"> =>
    smoothstep(u.elevationStart, u.elevationEnd, dirY)
      .mul(u.enabled)
      .mul(LAYER_MAX);
  const layer = layerAt(dir.y);

  const s3 = smoothstep(4.4, 6.2, layer);
  const s2 = smoothstep(2.6, 4.2, layer).mul(s3.oneMinus());
  const s1 = smoothstep(0.8, 2.4, layer).mul(s2.oneMinus().sub(s3));

  const step1 = mod(floor(time.mul(u.updateRate)), 4096);
  const step2 = floor(step1.mul(0.5));
  const step3 = floor(step1.mul(0.25));

  const cell3 = floor(px.div(u.blockSize3));
  const center3 = cell3.add(0.5).mul(u.blockSize3);
  const s3Block = smoothstep(4.4, 6.2, layerAt(rayDirection(center3).y)).mul(
    u.intensity,
  );
  const shifted = cellHash(cell3, step3, 100).lessThan(s3Block.mul(0.2));
  const k = floor(cellHash(cell3, step3, 101).mul(6));
  const shiftBlocks = select(k.lessThan(3), k.sub(3), k.sub(2));
  const offset = select(
    shifted,
    vec2(shiftBlocks.mul(u.blockSize3), 0),
    vec2(0),
  );
  const samplePx = px.add(offset).clamp(vec2(0), screenSize.sub(1));
  const base = skyColor(rayDirection(samplePx).y);

  const center1 = floor(samplePx.div(u.blockSize1)).add(0.5).mul(u.blockSize1);
  const flat = skyColor(rayDirection(center1).y);
  let rgb: Node<"vec3"> = mix(
    base,
    flat,
    s3.mul(u.intensity).mul(0.65).clamp(0, 1),
  );

  const artifacts = s1
    .mul(
      dctBlock(samplePx, u.blockSize1, step1, 3)
        .mul(0.035)
        .add(dcOffset(samplePx, u.blockSize1, step1, 9).mul(0.045)),
    )
    .add(
      s2.mul(
        dctBlock(samplePx, u.blockSize2, step2, 17)
          .mul(0.045)
          .add(dcOffset(samplePx, u.blockSize2, step2, 23).mul(0.05)),
      ),
    )
    .add(
      s3.mul(
        dctBlock(samplePx, u.blockSize3, step3, 31)
          .mul(0.06)
          .add(dcOffset(samplePx, u.blockSize3, step3, 37).mul(0.065)),
      ),
    );

  const band = fract(skyGradient(dir.y).mul(SKY_BANDS));
  const edge = smoothstep(0, 0.07, min(band, band.oneMinus())).oneMinus();
  const mosquito = cellHash(floor(samplePx), step1, 200)
    .sub(0.5)
    .mul(0.06)
    .mul(edge)
    .mul(smoothstep(0.6, 2.4, layer))
    .mul(smoothstep(3.6, 5.0, layer).oneMinus());

  rgb = rgb.add(vec3(artifacts.add(mosquito).mul(u.intensity)));

  const dropped = cellHash(cell3, step3, 102).lessThan(s3Block.mul(0.05));
  const dropLevel = select(
    cellHash(cell3, step3, 103).lessThan(0.5),
    float(1),
    float(0.82),
  );
  rgb = select(dropped, vec3(dropLevel), rgb);

  return {
    node: rgb.clamp(0, 1),
    apply(s) {
      const n = s.skyNoise;
      u.enabled.value = n.enabled ? 1 : 0;
      u.intensity.value = n.intensity;
      const blockSize = (size: number) => {
        const scaled = Math.max(Math.round(size * n.blockScale), 1);
        return s.enabled && s.pixelate.enabled
          ? Math.ceil(scaled / s.pixelate.pixelSize) * s.pixelate.pixelSize
          : scaled;
      };
      u.blockSize1.value = blockSize(BLOCK_SIZES[0]);
      u.blockSize2.value = blockSize(BLOCK_SIZES[1]);
      u.blockSize3.value = blockSize(BLOCK_SIZES[2]);
      const toSin = (deg: number) => Math.sin((deg * Math.PI) / 180);
      u.elevationStart.value = toSin(n.elevationStart);
      u.elevationEnd.value = toSin(
        Math.min(
          Math.max(n.elevationEnd, n.elevationStart + MIN_ELEVATION_RANGE),
          90,
        ),
      );
      u.updateRate.value = n.updateRate;
    },
  };
};

let shared: Skybox | null = null;

/**
 * 空は全シーンで1つを使い回す。ノードの cacheKey はインスタンスごとに違う(Node.customCacheKey が id)ので、
 * シーンの切り替えで作り直すと Background が背景の材質を差し替えて再コンパイルする。使い回してそれを避ける
 */
export const getSkybox = (): Skybox => {
  shared ??= createSkybox();
  return shared;
};
