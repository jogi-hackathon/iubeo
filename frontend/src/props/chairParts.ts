import type {Vec3} from "./types";

/** 椅子の部品。足元(座面の真下の床)が原点で、座面は -Z 向き(背もたれが +Z 側)。size は直方体の寸法、position は中心 */
export type ChairPart = {position: Vec3; size: Vec3};

const SEAT_SIZE = 0.45;
const SEAT_THICKNESS = 0.05;
const SEAT_HEIGHT = 0.45;
const BACK_HEIGHT = 0.5;
const BACK_THICKNESS = 0.04;
const LEG_SIZE = 0.04;
const LEG_INSET = 0.03;

const seatBottom = SEAT_HEIGHT - SEAT_THICKNESS / 2;
const legOffset = SEAT_SIZE / 2 - LEG_INSET - LEG_SIZE / 2;

export const CHAIR_PARTS: readonly ChairPart[] = [
  {
    position: [0, SEAT_HEIGHT, 0],
    size: [SEAT_SIZE, SEAT_THICKNESS, SEAT_SIZE],
  },
  {
    position: [
      0,
      SEAT_HEIGHT + SEAT_THICKNESS / 2 + BACK_HEIGHT / 2,
      SEAT_SIZE / 2 - BACK_THICKNESS / 2,
    ],
    size: [SEAT_SIZE, BACK_HEIGHT, BACK_THICKNESS],
  },
  ...([-1, 1] as const).flatMap((sx) =>
    ([-1, 1] as const).map((sz): ChairPart => ({
      position: [sx * legOffset, seatBottom / 2, sz * legOffset],
      size: [LEG_SIZE, seatBottom, LEG_SIZE],
    })),
  ),
];
