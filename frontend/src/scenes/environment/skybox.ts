import type {Camera} from "three";
import {
  cameraProjectionMatrixInverse,
  cameraWorldMatrix,
  color,
  cos,
  float,
  floor,
  fract,
  max,
  min,
  mix,
  mod,
  pow,
  select,
  smoothstep,
  time,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type {Node, WebGPURenderer} from "three/webgpu";

import type {PostProcessSettings} from "../../camera/postprocess/settings";
import {cellHash} from "../../core/cellHash";
import {drawingBufferSize, screenPixel} from "../../core/screenPixel";
import {
  approachCountdown,
  countdownTarget,
  type CountdownLevels,
} from "./countdownSky";
import {createSea} from "./sea";

export const SKY_HORIZON = "#ffffff";
const SKY_ZENITH = "#d9d9d9";
const SKY_BANDS = 28;
const BAND_AMOUNT = 0.9;
const BLOCK_SIZES = [8, 20, 44] as const;
const LAYER_MAX = 6.2;
const MIN_ELEVATION_RANGE = 1;
const ANOMALY_RED = "#b0101c";
const ANOMALY_RED_AMOUNT = 0.8;
const ANOMALY_INTENSITY = 2.5;
const ANOMALY_UPDATE_RATE = 24;
const ANOMALY_ATTACK_MS = 100;
const ANOMALY_HOLD_MS = 300;
const ANOMALY_DECAY_MS = 1000;
const ANOMALY_FLICKER = 0.3;
const COUNTDOWN_RED_MAX = 0.9;
const COUNTDOWN_NOISE_MAX = 0.55;
const COUNTDOWN_RATE_MAX = 0.12;
const COUNTDOWN_PREVIEW_MS = 22_000;
const COUNTDOWN_PREVIEW_HOLD_MS = 1500;

const skyGradient = (dirY: Node<"float">): Node<"float"> =>
  pow(max(dirY, 0), 1.15);

const skyColor = (dirY: Node<"float">): Node<"vec3"> => {
  const g = skyGradient(dirY);
  const banded = mix(g, floor(g.mul(SKY_BANDS)).div(SKY_BANDS), BAND_AMOUNT);
  return mix(color(SKY_HORIZON), color(SKY_ZENITH), banded);
};

const rayDirectionIn = (px: Node<"vec2">, size: Node<"vec2">): Node<"vec3"> => {
  const ndc = px.div(size).mul(2).sub(1).mul(vec2(1, -1));
  const view = cameraProjectionMatrixInverse.mul(vec4(ndc, 1, 1));
  return cameraWorldMatrix.mul(vec4(view.xyz.div(view.w), 0)).xyz.normalize();
};

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
  node: Node<"vec3">;
  apply(settings: PostProcessSettings): void;
  update(renderer: WebGPURenderer, camera: Camera): void;
  flashAnomaly(): void;
  setCountdown(remainingMs: number | null): void;
  previewCountdown(): void;
}

const anomalyEnvelope = (elapsed: number): number => {
  if (elapsed < 0) {
    return 0;
  }
  if (elapsed < ANOMALY_ATTACK_MS) {
    return elapsed / ANOMALY_ATTACK_MS;
  }
  const decay = (elapsed - ANOMALY_HOLD_MS) / ANOMALY_DECAY_MS;
  if (decay <= 0) {
    return 1;
  }
  return Math.max(0, 1 - decay) ** 2;
};

export interface SkyboxSurface {
  size: Node<"vec2">;
  pixel: Node<"vec2">;
}

const GAME_SURFACE: SkyboxSurface = {
  size: drawingBufferSize,
  pixel: screenPixel,
};

const createSkybox = (surface: SkyboxSurface): Skybox => {
  const {size: surfaceSize} = surface;
  const rayDirection = (px: Node<"vec2">): Node<"vec3"> =>
    rayDirectionIn(px, surfaceSize);
  const u = {
    enabled: uniform(1),
    intensity: uniform(1),
    blockSize1: uniform(8),
    blockSize2: uniform(20),
    blockSize3: uniform(44),
    elevationStart: uniform(0),
    elevationEnd: uniform(1),
    updateRate: uniform(2),
    red: uniform(0),
    noise: uniform(0),
    noiseRate: uniform(0),
  };
  let anomalyStartedAt = -Infinity;
  let remaining: number | null = null;
  let previewDeadline: number | null = null;
  let countdown: CountdownLevels = {red: 0, noise: 0};
  let lastUpdateAt = performance.now();

  const sea = createSea();
  const px = surface.pixel;
  const dir = rayDirection(px);
  const layerAt = (dirY: Node<"float">): Node<"float"> =>
    max(
      smoothstep(u.elevationStart, u.elevationEnd, dirY)
        .mul(u.enabled)
        .mul(LAYER_MAX),
      u.noise.mul(LAYER_MAX),
    );
  const intensity = u.intensity.add(u.noise.mul(ANOMALY_INTENSITY));
  const layer = layerAt(dir.y);

  const s3 = smoothstep(4.4, 6.2, layer);
  const s2 = smoothstep(2.6, 4.2, layer).mul(s3.oneMinus());
  const s1 = smoothstep(0.8, 2.4, layer).mul(s2.oneMinus().sub(s3));

  const step1 = mod(
    floor(time.mul(u.updateRate.add(u.noiseRate.mul(ANOMALY_UPDATE_RATE)))),
    4096,
  );
  const step2 = floor(step1.mul(0.5));
  const step3 = floor(step1.mul(0.25));

  const cell3 = floor(px.div(u.blockSize3));
  const center3 = cell3.add(0.5).mul(u.blockSize3);
  const s3Block = smoothstep(4.4, 6.2, layerAt(rayDirection(center3).y)).mul(
    intensity,
  );
  const shifted = cellHash(cell3, step3, 100).lessThan(s3Block.mul(0.2));
  const k = floor(cellHash(cell3, step3, 101).mul(6));
  const shiftBlocks = select(k.lessThan(3), k.sub(3), k.sub(2));
  const offset = select(
    shifted,
    vec2(shiftBlocks.mul(u.blockSize3), 0),
    vec2(0),
  );
  const samplePx = px.add(offset).clamp(vec2(0), surfaceSize.sub(1));
  const base = skyColor(rayDirection(samplePx).y);

  const center1 = floor(samplePx.div(u.blockSize1)).add(0.5).mul(u.blockSize1);
  const flat = skyColor(rayDirection(center1).y);
  let rgb: Node<"vec3"> = mix(
    base,
    flat,
    s3.mul(intensity).mul(0.65).clamp(0, 1),
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

  rgb = rgb.add(vec3(artifacts.add(mosquito).mul(intensity)));

  const dropped = cellHash(cell3, step3, 102).lessThan(s3Block.mul(0.05));
  const dropLevel = select(
    cellHash(cell3, step3, 103).lessThan(0.5),
    float(1),
    float(0.82),
  );
  rgb = select(dropped, vec3(dropLevel), rgb);
  const redShade = cellHash(cell3, step1, 300).mul(0.8).add(0.4);
  rgb = mix(
    rgb,
    color(ANOMALY_RED).mul(redShade),
    u.red.mul(ANOMALY_RED_AMOUNT),
  );
  rgb = select(dir.y.lessThan(0), sea.colorAt(px), rgb);

  return {
    node: rgb.clamp(0, 1),
    update: (renderer, camera) => {
      sea.update(renderer, camera);
      const now = performance.now();
      if (
        previewDeadline !== null &&
        now - previewDeadline > COUNTDOWN_PREVIEW_HOLD_MS
      ) {
        previewDeadline = null;
      }
      const effective =
        previewDeadline === null
          ? remaining
          : Math.min(remaining ?? Infinity, previewDeadline - now);
      countdown = approachCountdown(
        countdown,
        countdownTarget(effective),
        now - lastUpdateAt,
      );
      lastUpdateAt = now;
      const anomaly = anomalyEnvelope(now - anomalyStartedAt);
      const flickered =
        anomaly > 0 ? anomaly * (1 - ANOMALY_FLICKER * Math.random()) : 0;
      u.red.value = Math.max(flickered, countdown.red * COUNTDOWN_RED_MAX);
      u.noise.value = Math.max(
        flickered,
        countdown.noise * COUNTDOWN_NOISE_MAX,
      );
      u.noiseRate.value = Math.max(
        flickered,
        countdown.noise * COUNTDOWN_RATE_MAX,
      );
    },
    flashAnomaly: () => {
      anomalyStartedAt = performance.now();
    },
    setCountdown: (remainingMs) => {
      remaining = remainingMs;
    },
    previewCountdown: () => {
      previewDeadline = performance.now() + COUNTDOWN_PREVIEW_MS;
    },
    apply(s) {
      sea.apply(s);
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

export const getSkybox = (): Skybox => {
  shared ??= createSkybox(GAME_SURFACE);
  return shared;
};

export const createStandaloneSkybox = (surface: SkyboxSurface): Skybox =>
  createSkybox(surface);
