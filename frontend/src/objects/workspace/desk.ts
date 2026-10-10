import type {Vector3Tuple} from "three";

/**
 * 天板の上面の高さ。腰の高さ(身長 PLAYER_HEIGHT=1.7m の半分強 ≒ 0.94m)を目安に、立ち作業の机の高さ(1.0m 前後)との間で決めた。
 * 目の高さ EYE_HEIGHT=1.6m(player/constants.ts)からは 0.65m 下にあり、前縁から 0.6m 離れて立つと天板の中央(奥行き 0.4m)が
 * 約 33 度の見下ろしで視線の中央に入る。目から中央までは約 1.2m で、INTERACT_DISTANCE(2.5m)の内側
 */
export const DESK_HEIGHT = 0.95;
/** 天板。フットプリント(1.6m x 0.8m)は room の WORKSPACE_POSITION と test の配置の干渉計算が前提にしている */
export const TOP_SIZE: Vector3Tuple = [1.6, 0.04, 0.8];
const FRAME_INSET = 0.08;
const APRON_HEIGHT = 0.1;
const LEG_SIZE = 0.06;
const STRETCHER_SIZE = 0.04;
const STRETCHER_HEIGHT = 0.15;

/**
 * 天板の中央に空けておく作業スペース(x, z)。ファイル 1 枚(A4: 0.21m x 0.297m)を横向きに置いても四方に 0.2m 以上余る。
 * 天板上の小物はこの外に置き、作業中の光る板はこの大きさで出す
 */
export const WORK_AREA_SIZE = [0.7, 0.45] as const;

const DRAWER_SIZE: Vector3Tuple = [0.5, 0.16, 0.66];
const DRAWER_X = 0.42;
const DRAWER_PROTRUDE = 0.01;
const DRAWER_HANDLE_SIZE: Vector3Tuple = [0.16, 0.02, 0.02];

const PAPERS_SIZE: Vector3Tuple = [0.21, 0.025, 0.297];
const PAPERS_POSITION: Vector3Tuple = [-0.57, 0, 0.18];
const PAPERS_YAW = -0.12;

const PEN_STAND_RADIUS = 0.04;
const PEN_STAND_HEIGHT = 0.1;
const PEN_STAND_POSITION: Vector3Tuple = [0.6, 0, -0.22];
const PEN_RADIUS = 0.006;
const PEN_LENGTH = 0.15;
const PEN_TILT = 0.25;

export type PartShape = "box" | "cylinder";
/** 色の種類。白い世界(床・壁は #f0f0f0 前後)で見分けがつくよう、天板は温かい白、骨組みは一段暗い灰、金物は暗色 */
export type PartLook = "top" | "frame" | "accent" | "paper";

export type DeskPart = {
  shape: PartShape;
  look: PartLook;
  /** 部品の中心 */
  position: Vector3Tuple;
  /** 単位の形(箱は一辺 1、円柱は半径 1・高さ 1)に掛ける大きさ */
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
};

const topBottom = DESK_HEIGHT - TOP_SIZE[1];
const legX = TOP_SIZE[0] / 2 - FRAME_INSET;
const legZ = TOP_SIZE[2] / 2 - FRAME_INSET;

const STRUCTURE: readonly DeskPart[] = [
  {
    shape: "box",
    look: "top",
    position: [0, DESK_HEIGHT - TOP_SIZE[1] / 2, 0],
    scale: TOP_SIZE,
  },
  {
    shape: "box",
    look: "frame",
    position: [0, topBottom - APRON_HEIGHT / 2, 0],
    scale: [2 * legX, APRON_HEIGHT, 2 * legZ],
  },
  ...[-1, 1].flatMap((sx) =>
    [-1, 1].map((sz): DeskPart => ({
      shape: "box",
      look: "frame",
      position: [sx * legX, topBottom / 2, sz * legZ],
      scale: [LEG_SIZE, topBottom, LEG_SIZE],
    })),
  ),
  ...[-1, 1].map((sx): DeskPart => ({
    shape: "box",
    look: "frame",
    position: [sx * legX, STRETCHER_HEIGHT, 0],
    scale: [STRETCHER_SIZE, STRETCHER_SIZE, 2 * legZ - LEG_SIZE],
  })),
  {
    shape: "box",
    look: "frame",
    position: [0, STRETCHER_HEIGHT, -legZ],
    scale: [2 * legX - LEG_SIZE, STRETCHER_SIZE, STRETCHER_SIZE],
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
  },
  {
    shape: "box",
    look: "accent",
    position: [DRAWER_X, drawerY, drawerFrontZ + DRAWER_HANDLE_SIZE[2] / 2],
    scale: DRAWER_HANDLE_SIZE,
  },
];

const penStandY = DESK_HEIGHT + PEN_STAND_HEIGHT / 2;

/** 天板の上の小物。中央の作業スペース(WORK_AREA_SIZE)には何も置かない */
export const ON_TOP: readonly DeskPart[] = [
  {
    shape: "box",
    look: "paper",
    position: [
      PAPERS_POSITION[0],
      DESK_HEIGHT + PAPERS_SIZE[1] / 2,
      PAPERS_POSITION[2],
    ],
    scale: PAPERS_SIZE,
    rotation: [0, PAPERS_YAW, 0],
  },
  {
    shape: "cylinder",
    look: "frame",
    position: [PEN_STAND_POSITION[0], penStandY, PEN_STAND_POSITION[2]],
    scale: [PEN_STAND_RADIUS, PEN_STAND_HEIGHT, PEN_STAND_RADIUS],
  },
  {
    shape: "cylinder",
    look: "accent",
    position: [
      PEN_STAND_POSITION[0],
      penStandY + (PEN_LENGTH / 2) * Math.cos(PEN_TILT),
      PEN_STAND_POSITION[2],
    ],
    scale: [PEN_RADIUS, PEN_LENGTH, PEN_RADIUS],
    rotation: [0, 0, PEN_TILT],
  },
];

/** 机の部品すべて(描画の順) */
export const DESK_PARTS: readonly DeskPart[] = [
  ...STRUCTURE,
  ...UNDER_TOP,
  ...ON_TOP,
];
