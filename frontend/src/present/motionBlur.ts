const SHUTTER_S = 1 / 40;
const GAUSSIAN_PER_LENGTH = 1 / 3.5;
const MAX_VERTICAL_BLUR = 5.5;
const SMOOTH_MS = 120;
const JUMP_RATIO = 1 / 3;
const BLUR_ON = 0.4;
const BLUR_OFF = 0.15;

export const verticalBlur = (speedPxPerSec: number): number =>
  Math.min(
    MAX_VERTICAL_BLUR,
    Math.abs(speedPxPerSec) * SHUTTER_S * GAUSSIAN_PER_LENGTH,
  );

export const smoothSpeed = (prev: number, next: number, dtMs: number): number =>
  prev + (next - prev) * (1 - Math.exp(-dtMs / SMOOTH_MS));

export const isJump = (heightDelta: number, logHeight: number): boolean =>
  Math.abs(heightDelta) >= logHeight * JUMP_RATIO;

export const blurFilterOn = (wasOn: boolean, strength: number): boolean =>
  wasOn ? strength >= BLUR_OFF : strength >= BLUR_ON;
