export const SKY_FOV_DEG = 70;
export const SKY_HORIZON_FROM_TOP = 2 / 3;
export const SKY_EYE_HEIGHT = 1.6;
export const SKY_WARM_FRAMES = 8;
export const SKY_WARM_INTERVAL_MS = 400;

export const pitchForHorizon = (
  fovDeg: number,
  horizonFromTop: number,
): number =>
  Math.atan(Math.tan((fovDeg * Math.PI) / 360) * (2 * horizonFromTop - 1));

export const horizonFromTopAt = (fovDeg: number, pitch: number): number =>
  (1 + Math.tan(pitch) / Math.tan((fovDeg * Math.PI) / 360)) / 2;

export const isSkyActive = (inverted: boolean, blackedOut: boolean): boolean =>
  inverted && !blackedOut;
