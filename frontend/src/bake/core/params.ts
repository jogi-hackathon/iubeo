export const SAMPLES = 96;
export const MAX_DIST = 0.6;
export const BIAS = 0.002;
export const EMBEDDED = 0xffff;
export const INSIDE_RAYS = 16;
export const INSIDE_BACK_RATIO = 0.25;

export const TEXEL = 0.02;
export const MIN_TEXELS = 4;
export const MAX_TEXELS = 1024;
export const PAD = 1;
export const ATLAS_MAX = 8192;
export const CHART_INSET = 0.0005;
export const HIDDEN_UV = [0.2, 0.5, 0.8];
export const HIDDEN_STEP = 0.1;
export const HIDDEN_GRID_MAX = 128;
export const HIDDEN_RAYS = 32;
export const HIDDEN_AO_EPS = 0.02;
export const HIDDEN_BURIED_RATIO = 0.5;
export const HIDDEN_VOID_MAX_NY = -0.5;
export const HIDDEN_VOID_RATIO = 0.9;
export const HIDDEN_TEXELS = 2;

export const hiddenProbeUVs = (size: number): number[] => {
  const n = Math.min(HIDDEN_GRID_MAX, Math.ceil(size / HIDDEN_STEP - 1e-9));
  if (!(n > HIDDEN_UV.length)) {
    return HIDDEN_UV;
  }
  return Array.from({length: n}, (_, i) => (i + 0.5) / n);
};

export type Dir = {x: number; y: number; z: number};

export const hemisphereSamples = (n: number): Dir[] => {
  const dirs: Dir[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const r = Math.sqrt(u);
    const phi = i * golden;
    dirs.push({
      x: r * Math.cos(phi),
      y: r * Math.sin(phi),
      z: Math.sqrt(1 - u),
    });
  }
  return dirs;
};

export const SAMPLE_DIRS = hemisphereSamples(SAMPLES);
export const HIDDEN_DIRS = hemisphereSamples(HIDDEN_RAYS);

export const rotFor = (seed: number): number =>
  ((seed * 0.6180339887) % 1) * Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));
