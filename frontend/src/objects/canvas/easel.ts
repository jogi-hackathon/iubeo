import type {Vector3Tuple} from "three";

import {UNDER_SHEET_OFFSET} from "../paperSheet";

export const EASEL_LEAN = 0.2;
export const CANVAS_SIZE = [0.9, 1.0] as const;
export const CANVAS_CENTER_HEIGHT = 1.25;

const FRONT_LEG_SPAN = 0.76;
const LEG_SIZE = 0.045;
const FRONT_FOOT_Z = 0.3;
const FRONT_TOP_HEIGHT = 1.85;
const REAR_FOOT_Z = -0.6;
const FRAME_DEPTH = 0.03;
const PAPER_LIFT = 0.001;
const PAPER_MARGIN = 0.05;

const LEDGE_SIZE: Vector3Tuple = [0.98, 0.03, 0.1];
const LIP_SIZE: Vector3Tuple = [0.98, 0.02, 0.012];
const LIP_SETBACK = 0.002;

const CLAMP_SIZE: Vector3Tuple = [0.6, 0.04, FRAME_DEPTH + 0.01];
const TAB_WIDTH = 0.16;
const TAB_OVERLAP = 0.02;

const TOP_BAR_GAP = 0.0175;
const TOP_BAR_U =
  CANVAS_SIZE[1] / 2 + CLAMP_SIZE[1] + TOP_BAR_GAP + LEG_SIZE / 2;
const TOP_BAR_PROTRUDE = 0.006;

const STRETCHER_HEIGHT = 0.45;
const STRETCHER_SIZE = 0.035;

export type EaselLook = "wood" | "accent";

export type EaselPart = {
  look: EaselLook;
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
};

export type PaperPlacement = Omit<EaselPart, "look">;

export const placementProps = ({
  position,
  scale,
  rotation,
}: PaperPlacement) => ({
  position,
  scale,
  ...(rotation && {rotation}),
});

const sin = Math.sin(EASEL_LEAN);
const cos = Math.cos(EASEL_LEAN);
const frontZAt = (y: number) => FRONT_FOOT_Z - y * Math.tan(EASEL_LEAN);
const ORIGIN: Vector3Tuple = [
  0,
  CANVAS_CENTER_HEIGHT,
  frontZAt(CANVAS_CENTER_HEIGHT),
];
const onPlane = (u: number, n: number, x = 0): Vector3Tuple => [
  ORIGIN[0] + x,
  ORIGIN[1] + u * cos + n * sin,
  ORIGIN[2] - u * sin + n * cos,
];
const LEAN_ROTATION: Vector3Tuple = [-EASEL_LEAN, 0, 0];

const strut = (
  look: EaselLook,
  fromPoint: Vector3Tuple,
  to: Vector3Tuple,
  size: number,
  grounded = false,
): EaselPart => {
  const tilt = Math.atan2(Math.abs(to[2] - fromPoint[2]), to[1] - fromPoint[1]);
  const from: Vector3Tuple = grounded
    ? [fromPoint[0], fromPoint[1] - (size / 2) * Math.sin(tilt), fromPoint[2]]
    : fromPoint;
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return {
    look,
    position: [
      (from[0] + to[0]) / 2,
      (from[1] + to[1]) / 2,
      (from[2] + to[2]) / 2,
    ],
    scale: [size, Math.hypot(dy, dz), size],
    rotation: [Math.atan2(dz, dy), 0, 0],
  };
};

const frontX = FRONT_LEG_SPAN / 2;
const legPoint = (x: number, y: number): Vector3Tuple => [x, y, frontZAt(y)];
const stretcherY = STRETCHER_HEIGHT;

export const TOP_BAR_PART: EaselPart = {
  look: "wood",
  position: onPlane(TOP_BAR_U, 0),
  scale: [FRONT_LEG_SPAN, LEG_SIZE, LEG_SIZE + 2 * TOP_BAR_PROTRUDE],
  rotation: LEAN_ROTATION,
};

export const REAR_LEG_PART: EaselPart = strut(
  "wood",
  [0, 0, REAR_FOOT_Z],
  TOP_BAR_PART.position,
  LEG_SIZE,
  true,
);

const LEGS: readonly EaselPart[] = [
  ...[-1, 1].map((s) =>
    strut(
      "wood",
      [s * frontX, 0, FRONT_FOOT_Z],
      legPoint(s * frontX, FRONT_TOP_HEIGHT),
      LEG_SIZE,
      true,
    ),
  ),
  REAR_LEG_PART,
  TOP_BAR_PART,
  {
    look: "wood",
    position: [0, stretcherY, frontZAt(stretcherY)],
    scale: [FRONT_LEG_SPAN, STRETCHER_SIZE, STRETCHER_SIZE],
    rotation: LEAN_ROTATION,
  },
];

const frameN = LEG_SIZE / 2 + FRAME_DEPTH / 2;

export const CLAMP_PART: EaselPart = {
  look: "accent",
  position: onPlane(
    CANVAS_SIZE[1] / 2 + CLAMP_SIZE[1] / 2,
    LEG_SIZE / 2 + CLAMP_SIZE[2] / 2,
  ),
  scale: CLAMP_SIZE,
  rotation: LEAN_ROTATION,
};

const paperFrontN = LEG_SIZE / 2 + FRAME_DEPTH + PAPER_LIFT;
const clampFrontN = LEG_SIZE / 2 + CLAMP_SIZE[2];
const TAB_BOTTOM_U = CANVAS_SIZE[1] / 2 - PAPER_MARGIN - TAB_OVERLAP;
const TAB_TOP_U = CANVAS_SIZE[1] / 2 + 0.02;
const TAB_BACK_N = LEG_SIZE / 2 + FRAME_DEPTH;
const TAB_FRONT_N = Math.min(paperFrontN + 0.01, clampFrontN - 0.002);

const CANVAS_PARTS: readonly EaselPart[] = [
  {
    look: "wood",
    position: onPlane(0, frameN),
    scale: [CANVAS_SIZE[0], CANVAS_SIZE[1], FRAME_DEPTH],
    rotation: LEAN_ROTATION,
  },
  {
    look: "wood",
    position: onPlane(
      -CANVAS_SIZE[1] / 2 - LEDGE_SIZE[1] / 2,
      LEG_SIZE / 2 + LEDGE_SIZE[2] / 2,
    ),
    scale: LEDGE_SIZE,
    rotation: LEAN_ROTATION,
  },
  {
    look: "wood",
    position: onPlane(
      -CANVAS_SIZE[1] / 2 + LIP_SIZE[1] / 2,
      LEG_SIZE / 2 + LEDGE_SIZE[2] - LIP_SETBACK - LIP_SIZE[2] / 2,
    ),
    scale: LIP_SIZE,
    rotation: LEAN_ROTATION,
  },
  CLAMP_PART,
  {
    look: "accent",
    position: onPlane(
      (TAB_BOTTOM_U + TAB_TOP_U) / 2,
      (TAB_BACK_N + TAB_FRONT_N) / 2,
    ),
    scale: [TAB_WIDTH, TAB_TOP_U - TAB_BOTTOM_U, TAB_FRONT_N - TAB_BACK_N],
    rotation: LEAN_ROTATION,
  },
];

export const EASEL_PARTS: readonly EaselPart[] = [...LEGS, ...CANVAS_PARTS];

export const PAPER_SIZE = [
  CANVAS_SIZE[0] - 2 * PAPER_MARGIN,
  CANVAS_SIZE[1] - 2 * PAPER_MARGIN,
] as const;

export const PAPER_PLACEMENT: PaperPlacement = {
  position: onPlane(0, paperFrontN),
  scale: [PAPER_SIZE[0], PAPER_SIZE[1], 1],
  rotation: LEAN_ROTATION,
};

export const UNDER_SHEET_PLACEMENT: PaperPlacement = {
  position: onPlane(
    -UNDER_SHEET_OFFSET,
    paperFrontN - PAPER_LIFT / 2,
    UNDER_SHEET_OFFSET,
  ),
  scale: PAPER_PLACEMENT.scale,
  rotation: LEAN_ROTATION,
};
