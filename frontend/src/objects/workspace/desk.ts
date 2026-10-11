import type {Vector3Tuple} from "three";

/**
 * 天板の上面の高さ。腰の高さ(身長 PLAYER_HEIGHT=1.7m の半分強 ≒ 0.94m)を目安に、立ち作業の机の高さ(1.0m 前後)との間で決めた。
 * 目の高さ EYE_HEIGHT=1.6m(player/constants.ts)からは 0.65m 下にあり、前縁から 0.6m 離れて立つと天板の中央(奥行き 0.4m)が
 * 約 33 度の見下ろしで視線の中央に入る。目から中央までは約 1.2m で、INTERACT_DISTANCE(2.5m)の内側
 */
export const DESK_HEIGHT = 0.95;
/** 天板。フットプリント(1.6m x 0.8m)は room の WORKSPACE_POSITION と test の配置の干渉計算が前提にしている */
export const TOP_SIZE: Vector3Tuple = [1.6, 0.04, 0.8];
const TOP_REVEAL_HEIGHT = 0.01;
const TOP_REVEAL_INSET = 0.012;
const TOP_RADIUS = 0.005;
const FRAME_INSET = 0.08;
const APRON_HEIGHT = 0.1;
const APRON_RADIUS = 0.004;
const LEG_SIZE = 0.06;
const LEG_RADIUS = 0.003;
const STRETCHER_SIZE = 0.04;
const STRETCHER_HEIGHT = 0.15;
const STRETCHER_RADIUS = 0.003;
const FOOT_RADIUS = 0.022;
const FOOT_HEIGHT = 0.012;

const DRAWER_SIZE: Vector3Tuple = [0.5, 0.16, 0.66];
const DRAWER_X = 0.42;
const DRAWER_PROTRUDE = 0.01;
const DRAWER_HANDLE_SIZE: Vector3Tuple = [0.16, 0.02, 0.02];
const DRAWER_RADIUS = 0.004;

export const FILE_SIZE = [0.297, 0.42] as const;
export const FILE_POSITION: Vector3Tuple = [0, DESK_HEIGHT + 0.001, 0];

export type PartShape = "box" | "cylinder";
export type PartLook = "top" | "frame" | "accent";

export type DeskPart = {
  shape: PartShape;
  look: PartLook;
  /** 部品の中心 */
  position: Vector3Tuple;
  /** 単位の形(箱は一辺 1、円柱は半径 1・高さ 1)に掛ける大きさ */
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
  radius?: number;
  segments?: number;
};

const topBottom = DESK_HEIGHT - TOP_SIZE[1];
const legX = TOP_SIZE[0] / 2 - FRAME_INSET;
const legZ = TOP_SIZE[2] / 2 - FRAME_INSET;

const topSlabHeight = TOP_SIZE[1] - TOP_REVEAL_HEIGHT;
const legHeight = topBottom - FOOT_HEIGHT;

const STRUCTURE: readonly DeskPart[] = [
  {
    shape: "box",
    look: "top",
    position: [0, DESK_HEIGHT - topSlabHeight / 2, 0],
    scale: [TOP_SIZE[0], topSlabHeight, TOP_SIZE[2]],
    radius: TOP_RADIUS,
    segments: 2,
  },
  {
    shape: "box",
    look: "top",
    position: [0, topBottom + TOP_REVEAL_HEIGHT / 2, 0],
    scale: [
      TOP_SIZE[0] - 2 * TOP_REVEAL_INSET,
      TOP_REVEAL_HEIGHT,
      TOP_SIZE[2] - 2 * TOP_REVEAL_INSET,
    ],
  },
  {
    shape: "box",
    look: "frame",
    position: [0, topBottom - APRON_HEIGHT / 2, 0],
    scale: [2 * legX, APRON_HEIGHT, 2 * legZ],
    radius: APRON_RADIUS,
  },
  ...[-1, 1].flatMap((sx) =>
    [-1, 1].map((sz): DeskPart => ({
      shape: "box",
      look: "frame",
      position: [sx * legX, FOOT_HEIGHT + legHeight / 2, sz * legZ],
      scale: [LEG_SIZE, legHeight, LEG_SIZE],
      radius: LEG_RADIUS,
    })),
  ),
  ...[-1, 1].map((sx): DeskPart => ({
    shape: "box",
    look: "frame",
    position: [sx * legX, STRETCHER_HEIGHT, 0],
    scale: [STRETCHER_SIZE, STRETCHER_SIZE, 2 * legZ - LEG_SIZE],
    radius: STRETCHER_RADIUS,
  })),
  {
    shape: "box",
    look: "frame",
    position: [0, STRETCHER_HEIGHT, -legZ],
    scale: [2 * legX - LEG_SIZE, STRETCHER_SIZE, STRETCHER_SIZE],
    radius: STRETCHER_RADIUS,
  },
];

const drawerY = topBottom - DRAWER_SIZE[1] / 2;
const drawerFrontZ = legZ + DRAWER_PROTRUDE;

const UNDER_TOP: readonly DeskPart[] = [
  {
    shape: "box",
    look: "frame",
    position: [DRAWER_X, drawerY, drawerFrontZ - DRAWER_SIZE[2] / 2],
    scale: DRAWER_SIZE,
    radius: DRAWER_RADIUS,
  },
  {
    shape: "box",
    look: "accent",
    position: [DRAWER_X, drawerY, drawerFrontZ + DRAWER_HANDLE_SIZE[2] / 2],
    scale: DRAWER_HANDLE_SIZE,
    radius: DRAWER_RADIUS,
  },
];

export const DESK_BODY: readonly DeskPart[] = [...STRUCTURE, ...UNDER_TOP];

export const DESK_FEET: readonly DeskPart[] = [-1, 1].flatMap((sx) =>
  [-1, 1].map((sz): DeskPart => ({
    shape: "cylinder",
    look: "accent",
    position: [sx * legX, FOOT_HEIGHT / 2, sz * legZ],
    scale: [FOOT_RADIUS, FOOT_HEIGHT, FOOT_RADIUS],
  })),
);

/** 机の部品すべて(描画の順) */
export const DESK_PARTS: readonly DeskPart[] = [...DESK_BODY, ...DESK_FEET];
