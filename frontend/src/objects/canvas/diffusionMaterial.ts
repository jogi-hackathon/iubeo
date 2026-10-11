import {Vector4} from "three";
import {
  exp2,
  float,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  pow,
  select,
  sin,
  smoothstep,
  sRGBTransferEOTF,
  sqrt,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import {MeshStandardNodeMaterial, type Node} from "three/webgpu";

import {cellHash} from "../../core/cellHash";
import {PAPER_SIZE} from "./easel";

const LATENT_PER_METER = 50;
const LATENT = [
  Math.round(PAPER_SIZE[0] * LATENT_PER_METER),
  Math.round(PAPER_SIZE[1] * LATENT_PER_METER),
] as const;
const PAPER_ASPECT = PAPER_SIZE[0] / PAPER_SIZE[1];
const STEPS = 24;
const COARSE_LEVELS = 4;
const TONES = 6;
const INK = 0.32;
const LATENT_MEAN = 0.72;
const LATENT_SCALE = 0.3;
const NOISE_FALLOFF = 1.6;
const FRESH_NOISE = 0.6;
const WIPE_EDGE = 0.15;

const PICTURE_RANDOMS = 12;

const gaussian = (
  cell: Node<"vec2">,
  step: Node<"float">,
  seed: number,
): Node<"float"> =>
  cellHash(cell, step, seed)
    .add(cellHash(cell, step, seed + 1))
    .add(cellHash(cell, step, seed + 2))
    .sub(1.5)
    .mul(2);

const picture = (
  p: Node<"vec2">,
  r: (k: number) => Node<"float">,
): Node<"float"> => {
  const wave = (freq: Node<"float">, phase: Node<"float">) =>
    sin(p.x.mul(freq).add(phase.mul(Math.PI * 2)));

  const horizon = r(0).mul(0.15).add(0.3);
  const far = horizon
    .add(0.14)
    .add(wave(r(1).mul(4).add(3), r(2)).mul(0.06))
    .add(wave(r(3).mul(8).add(9), r(4)).mul(0.02));
  const near = horizon
    .add(wave(r(5).mul(3).add(2), r(6)).mul(0.08))
    .add(wave(r(7).mul(7).add(6), r(8)).mul(0.03));
  const sunCenter = vec2(r(9).mul(0.6).add(0.2), r(10).mul(0.15).add(0.68));
  const sunRadius = r(11).mul(0.05).add(0.09);

  const sky = mix(float(1), float(0.8), smoothstep(horizon, 1, p.y));
  const sun = smoothstep(
    sunRadius.sub(0.01),
    sunRadius,
    length(p.sub(sunCenter).mul(vec2(PAPER_ASPECT, 1))),
  ).oneMinus();
  let tone: Node<"float"> = mix(sky, float(0.55), sun);
  tone = select(p.y.lessThan(far), float(0.72), tone);
  tone = select(
    p.y.lessThan(near),
    mix(float(0.5), float(INK), smoothstep(0, near, p.y).oneMinus()),
    tone,
  );
  const level = floor(
    tone
      .sub(INK)
      .div(1 - INK)
      .mul(TONES - 1)
      .add(0.5),
  );
  return level
    .div(TONES - 1)
    .mul(1 - INK)
    .add(INK);
};

const coarsePicture = (
  cell: Node<"vec2">,
  block: Node<"float">,
  r: (k: number) => Node<"float">,
): Node<"float"> =>
  picture(
    floor(cell.div(block))
      .add(0.5)
      .mul(block)
      .clamp(vec2(0.5), vec2(...LATENT).sub(0.5))
      .div(vec2(...LATENT)),
    r,
  );

export interface DiffusionPaper {
  material: MeshStandardNodeMaterial;
  progress: {value: number};
  appear: {value: number};
  fade: {value: number};
  reseed(random?: () => number): void;
}

export const createDiffusionPaper = (): DiffusionPaper => {
  const progress = uniform(0);
  const appear = uniform(0);
  const fade = uniform(1);
  const seed = uniform(0);
  const randoms = Array.from({length: PICTURE_RANDOMS / 4}, () =>
    uniform(new Vector4()),
  );
  const r = (k: number): Node<"float"> => {
    const v = randoms[Math.floor(k / 4)]!;
    return [v.x, v.y, v.z, v.w][k % 4]!;
  };

  const cell = min(floor(uv().mul(vec2(...LATENT))), vec2(...LATENT).sub(1));
  const step = floor(progress.mul(STEPS));
  const t = step.div(STEPS);
  const seedKey = seed.mul(STEPS + 2);

  const level = float(1).sub(t).mul(COARSE_LEVELS);
  const fine = floor(level);
  const x0 = mix(
    coarsePicture(cell, exp2(fine), r),
    coarsePicture(cell, exp2(fine.add(1)), r),
    fract(level),
  )
    .sub(LATENT_MEAN)
    .div(LATENT_SCALE);

  const noiseLevel = pow(max(t.oneMinus(), 1e-4), NOISE_FALLOFF);
  const noise = mix(
    gaussian(cell, seedKey.add(STEPS + 1), 0),
    gaussian(cell, seedKey.add(step), 10),
    FRESH_NOISE,
  ).div(Math.hypot(1 - FRESH_NOISE, FRESH_NOISE));
  const xt = sqrt(noiseLevel.mul(noiseLevel).oneMinus())
    .mul(x0)
    .add(noiseLevel.mul(noise));
  const tone = xt.mul(LATENT_SCALE).add(LATENT_MEAN).clamp(0, 1);

  const shown = cellHash(cell, seedKey, 20).lessThan(appear);
  const row = cell.y.add(0.5).div(LATENT[1]);
  const remain = fade
    .mul(1 + WIPE_EDGE)
    .sub(row)
    .div(WIPE_EDGE)
    .clamp(0, 1);
  const srgb = mix(float(1), select(shown, tone, float(1)), remain);
  const material = new MeshStandardNodeMaterial();
  material.colorNode = sRGBTransferEOTF(vec3(srgb)) as Node<"vec3">;

  return {
    material,
    progress,
    appear,
    fade,
    reseed(random = Math.random) {
      seed.value = Math.floor(random() * 65536);
      for (const v of randoms) {
        v.value.set(random(), random(), random(), random());
      }
    },
  };
};
