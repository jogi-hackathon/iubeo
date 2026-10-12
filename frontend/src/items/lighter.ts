import type {Vector3Tuple} from "three";

export const LIGHTER_KIND = "lighter";

const WIDTH = 0.038;
const DEPTH = 0.013;
const CASE_HEIGHT = 0.037;
const LID_HEIGHT = 0.02;
export const LIGHTER_HEIGHT = CASE_HEIGHT + LID_HEIGHT;
export const LIGHTER_FOOTPRINT = [WIDTH, DEPTH] as const;

const SEAM_HEIGHT = 0.0015;
const SEAM_PROTRUDE = 0.0005;
const HINGE_RADIUS = 0.0022;
const HINGE_LENGTH = 0.012;

const CHIMNEY_SIZE: Vector3Tuple = [0.02, 0.016, 0.011];
const CHIMNEY_X = -0.005;
const WHEEL_RADIUS = 0.0045;
const WHEEL_WIDTH = 0.006;
const WHEEL_X = 0.0105;
const WHEEL_Y = CASE_HEIGHT + 0.009;
const WICK_RADIUS = 0.0013;
const WICK_PROTRUDE = 0.003;

export type LighterPartShape = "box" | "cylinder";
export type LighterPartLook = "body" | "accent";

export type LighterPart = {
  shape: LighterPartShape;
  look: LighterPartLook;
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
};

export const LIGHTER_CASE_PARTS: readonly LighterPart[] = [
  {
    shape: "box",
    look: "body",
    position: [0, CASE_HEIGHT / 2, 0],
    scale: [WIDTH, CASE_HEIGHT, DEPTH],
  },
  {
    shape: "box",
    look: "accent",
    position: [0, CASE_HEIGHT, 0],
    scale: [WIDTH + 2 * SEAM_PROTRUDE, SEAM_HEIGHT, DEPTH + 2 * SEAM_PROTRUDE],
  },
  {
    shape: "cylinder",
    look: "accent",
    position: [WIDTH / 2, CASE_HEIGHT, 0],
    scale: [HINGE_RADIUS, HINGE_LENGTH, HINGE_RADIUS],
  },
];

export const LIGHTER_LID_PIVOT: Vector3Tuple = [WIDTH / 2, CASE_HEIGHT, 0];
export const LIGHTER_LID_PART: LighterPart = {
  shape: "box",
  look: "body",
  position: [-WIDTH / 2, LID_HEIGHT / 2, 0],
  scale: [WIDTH, LID_HEIGHT, DEPTH],
};
export const LIGHTER_LID_OPEN_ANGLE = -0.9 * Math.PI;

export const LIGHTER_INSERT_PARTS: readonly LighterPart[] = [
  {
    shape: "box",
    look: "body",
    position: [CHIMNEY_X, CASE_HEIGHT + CHIMNEY_SIZE[1] / 2, 0],
    scale: CHIMNEY_SIZE,
  },
  {
    shape: "cylinder",
    look: "accent",
    position: [WHEEL_X, WHEEL_Y, 0],
    scale: [WHEEL_RADIUS, WHEEL_WIDTH, WHEEL_RADIUS],
    rotation: [Math.PI / 2, 0, 0],
  },
  {
    shape: "cylinder",
    look: "accent",
    position: [CHIMNEY_X, CASE_HEIGHT + CHIMNEY_SIZE[1], 0],
    scale: [WICK_RADIUS, 2 * WICK_PROTRUDE, WICK_RADIUS],
  },
];

export const LIGHTER_FLAME_BASE: Vector3Tuple = [
  CHIMNEY_X,
  CASE_HEIGHT + CHIMNEY_SIZE[1],
  0,
];
export const LIGHTER_FLAME_SIZE: Vector3Tuple = [0.013, 0.034, 0.013];
export const LIGHTER_FLAME_PROFILE = {
  baseRadius: 0.3,
  widestAt: 0.3,
  tipPower: 1.6,
} as const;
export const LIGHTER_FLAME_CORE = {width: 0.42, height: 0.58} as const;

export const LIGHTER_HELD_SCALE = 1.5;
export const LIGHTER_HELD_OUTLINE = 0.0012;
export const LIGHTER_HELD_CENTER_Y = LIGHTER_HEIGHT / 2;
export const LIGHTER_HELD_REACH = {
  below: LIGHTER_HELD_CENTER_Y,
  front: DEPTH / 2,
} as const;

export const LIGHTER_OPEN_MS = 260;
const LID_HIT_AT = 0.6;
const LID_REBOUND = 0.06;
export const LIGHTER_IGNITE_DELAY_MS = 340;
export const LIGHTER_IGNITE_MS = 220;
const IGNITE_PUFF = 1.35;
const IGNITE_PUFF_AT = 0.4;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeOutQuad = (t: number) => 1 - (1 - t) ** 2;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

const lidOpening = (t: number): number => {
  if (t < LID_HIT_AT) {
    return easeOutCubic(t / LID_HIT_AT);
  }
  const settle = (t - LID_HIT_AT) / (1 - LID_HIT_AT);
  return 1 - LID_REBOUND * Math.sin(Math.PI * settle) * (1 - settle);
};

const flameSize = (t: number): number => {
  if (t < IGNITE_PUFF_AT) {
    return IGNITE_PUFF * easeOutQuad(t / IGNITE_PUFF_AT);
  }
  const settle = (t - IGNITE_PUFF_AT) / (1 - IGNITE_PUFF_AT);
  return IGNITE_PUFF + (1 - IGNITE_PUFF) * easeInOut(settle);
};

export const heldLighterPose = (
  elapsedMs: number,
): {lidAngle: number; flame: number} => {
  const ignite = (elapsedMs - LIGHTER_IGNITE_DELAY_MS) / LIGHTER_IGNITE_MS;
  return {
    lidAngle:
      LIGHTER_LID_OPEN_ANGLE * lidOpening(clamp01(elapsedMs / LIGHTER_OPEN_MS)),
    flame: ignite <= 0 ? 0 : flameSize(clamp01(ignite)),
  };
};
