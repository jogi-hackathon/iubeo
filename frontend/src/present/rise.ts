import {EYE_HEIGHT} from "../player/constants";

interface RiseKey {
  ms: number;
  height: number;
  roll: number;
  pitch: number;
}

export const FLOOR_EYE_HEIGHT = 0.2;

const SIDEWAYS = (85 * Math.PI) / 180;

export const RISE_KEYS: readonly RiseKey[] = [
  {ms: 0, height: 0, roll: SIDEWAYS, pitch: -0.2},
  {ms: 450, height: 0, roll: SIDEWAYS, pitch: -0.2},
  {ms: 950, height: 0.14, roll: 1.2, pitch: -0.4},
  {ms: 1250, height: 0.04, roll: 1.3, pitch: -0.3},
  {ms: 1950, height: 0.45, roll: 0.5, pitch: -0.35},
  {ms: 2250, height: 0.55, roll: 0.28, pitch: -0.15},
  {ms: 2600, height: 1.03, roll: -0.05, pitch: 0.05},
  {ms: 3000, height: 1, roll: 0, pitch: 0},
];

export const RISE_DURATION_MS = RISE_KEYS[RISE_KEYS.length - 1]!.ms;

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export const riseAt = (
  ms: number,
  keys: readonly RiseKey[] = RISE_KEYS,
): {height: number; roll: number; pitch: number} => {
  const first = keys[0]!;
  if (ms <= first.ms) {
    return {height: first.height, roll: first.roll, pitch: first.pitch};
  }
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    if (ms <= b.ms) {
      const t = smoothstep((ms - a.ms) / (b.ms - a.ms));
      return {
        height: a.height + (b.height - a.height) * t,
        roll: a.roll + (b.roll - a.roll) * t,
        pitch: a.pitch + (b.pitch - a.pitch) * t,
      };
    }
  }
  const last = keys[keys.length - 1]!;
  return {height: last.height, roll: last.roll, pitch: last.pitch};
};

export const riseEyeHeight = (height: number): number =>
  FLOOR_EYE_HEIGHT * (1 - height) + EYE_HEIGHT * height;
