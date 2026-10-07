import {DESK_HEIGHT} from "../../objects/workspace/desk";
import type {Vec3} from "../../props/types";

// 部屋は一辺 12m の立方体の空洞。ディレクトリの俯瞰カメラ(山の真上 10.8m 以上)が天井の内側に収まる高さ。
// x は 0 を中心に、z は ROOM_CENTER_Z を中心にして、スポーン地点(0, 0)が部屋の手前の壁際になるようにする(正面は -Z)
export const ROOM_SIZE = 12;
export const WALL_THICKNESS = 0.5;
export const ROOM_CENTER_Z = -4;

const HALF = ROOM_SIZE / 2;
const WALL_CENTER = HALF + WALL_THICKNESS / 2;
/** 室内側の壁面の位置(x は ±ROOM_INNER_X、z は ROOM_INNER_Z_NORTH〜ROOM_INNER_Z_SOUTH) */
export const ROOM_INNER_X = HALF;
export const ROOM_INNER_Z_NORTH = ROOM_CENTER_Z - HALF;
export const ROOM_INNER_Z_SOUTH = ROOM_CENTER_Z + HALF;

/** 左(-X)の壁の窓。専用のジオメトリを別で作るので、今は何もはめない正方形の空洞 */
export const WINDOW_SIZE = 4;
export const WINDOW_SILL_HEIGHT = 1;
export const WINDOW_CENTER_Z = ROOM_CENTER_Z;

/** 直方体の壁。position は中心 */
export type WallSpec = {position: Vec3; size: Vec3};

const OUTER = ROOM_SIZE + 2 * WALL_THICKNESS;
const windowTop = WINDOW_SILL_HEIGHT + WINDOW_SIZE;
const windowSouthZ = WINDOW_CENTER_Z + WINDOW_SIZE / 2;
const windowNorthZ = WINDOW_CENTER_Z - WINDOW_SIZE / 2;

/** 窓の脇の壁。z は (north, south) の範囲、y は窓の高さ */
const besideWindow = (zFrom: number, zTo: number): WallSpec => ({
  position: [
    -WALL_CENTER,
    WINDOW_SILL_HEIGHT + WINDOW_SIZE / 2,
    (zFrom + zTo) / 2,
  ],
  size: [WALL_THICKNESS, WINDOW_SIZE, zTo - zFrom],
});

/** 部屋の床。上面が y=0 で、壁の下まで敷く(共通の TiledFloor は使わない) */
export const ROOM_FLOOR: WallSpec = {
  position: [0, -WALL_THICKNESS / 2, ROOM_CENTER_Z],
  size: [OUTER, WALL_THICKNESS, OUTER],
};

/** 部屋を囲む壁と天井。左の壁には窓の空洞を空ける */
export const ROOM_WALLS: readonly WallSpec[] = [
  // 奥(-Z)と手前(+Z)の壁は、角まで覆う
  {
    position: [0, HALF, ROOM_CENTER_Z - WALL_CENTER],
    size: [OUTER, ROOM_SIZE, WALL_THICKNESS],
  },
  {
    position: [0, HALF, ROOM_CENTER_Z + WALL_CENTER],
    size: [OUTER, ROOM_SIZE, WALL_THICKNESS],
  },
  // 右(+X)の壁
  {
    position: [WALL_CENTER, HALF, ROOM_CENTER_Z],
    size: [WALL_THICKNESS, ROOM_SIZE, ROOM_SIZE],
  },
  // 左(-X)の壁: 窓の下・上・奥側・手前側の 4 枚
  {
    position: [-WALL_CENTER, WINDOW_SILL_HEIGHT / 2, ROOM_CENTER_Z],
    size: [WALL_THICKNESS, WINDOW_SILL_HEIGHT, ROOM_SIZE],
  },
  {
    position: [-WALL_CENTER, (windowTop + ROOM_SIZE) / 2, ROOM_CENTER_Z],
    size: [WALL_THICKNESS, ROOM_SIZE - windowTop, ROOM_SIZE],
  },
  besideWindow(ROOM_INNER_Z_NORTH, windowNorthZ),
  besideWindow(windowSouthZ, ROOM_INNER_Z_SOUTH),
  // 天井
  {
    position: [0, ROOM_SIZE + WALL_THICKNESS / 2, ROOM_CENTER_Z],
    size: [OUTER, WALL_THICKNESS, OUTER],
  },
];

// オブジェクトの置き場所(足元の位置)。スケッチどおり、ディレクトリは奥の壁、キャンバスは奥の右隅、
// 机は部屋の中央、イスは机の手前(+Z 側)で机の方(-Z)を向く。
// ディレクトリは山の半分が壁に埋まるよう、奥の壁の室内側の面に中心を置く(半径 3.6m の山が室内に張り出す)。
// 机の奥の縁(z=-4.4)と山の端(束の端まで 4.4m)は 1m 以上空く
export const DIRECTORY_POSITION: Vec3 = [0, 0, ROOM_INNER_Z_NORTH];
export const WORKSPACE_POSITION: Vec3 = [0, 0, ROOM_CENTER_Z];
export const CANVAS_POSITION: Vec3 = [4.8, 0, -8.2];
export const CHAIR_POSITION: Vec3 = [0, 0, -3.05];
/** PC は机の上の奥側(作業スペースの外)。今は見た目が無く、データだけ */
export const PC_POSITION: Vec3 = [
  WORKSPACE_POSITION[0],
  DESK_HEIGHT,
  WORKSPACE_POSITION[2] - 0.3,
];
