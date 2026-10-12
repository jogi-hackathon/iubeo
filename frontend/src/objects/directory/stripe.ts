export const STRIPE_PITCH = 0.012;
export const LINE_WIDTH = 0.16;
export const LINE_STRENGTH = 0.16;
export const AVG_COVERAGE = 0.14;

export const stripePhase = (
  y01: number,
  height: number,
  pitch = STRIPE_PITCH,
): number => (y01 * height) / pitch;

const hash = (x: number): number => {
  const v = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

export const stripeFactor = (phase: number, seed = 0): number => {
  const i = Math.floor(phase);
  const f = phase - i;
  const n = hash(i + seed);
  const n2 = hash(i + seed + 17.3);
  const center = 0.5 + (n - 0.5) * 0.3;
  const width = LINE_WIDTH * (0.6 + 0.8 * n2);
  const d = Math.abs(f - center);
  const t = Math.min(1, Math.max(0, (d - width * 0.5) / (width * 0.5)));
  const line = 1 - t * t * (3 - 2 * t);
  return 1 - line * LINE_STRENGTH * (0.4 + 0.6 * n);
};

export const AVG_FACTOR = 1 - AVG_COVERAGE * LINE_STRENGTH * 0.7;
