import {directoryItem, type SceneLayout} from "../../objects/layout";
import {LIGHTER_STAND_ON_DESK} from "../../objects/lighter_stand/stand";
import {DESK_HEIGHT} from "../../objects/workspace/desk";
import type {Vec3} from "../../props/types";

// 部屋は一辺 6m の立方体の空洞(人の背丈に合わせた 1 人用の部屋の大きさ。ディレクトリの山の大きさは基準にしない)。
// x は 0 を中心に、z は ROOM_CENTER_Z を中心にして、スポーン地点(0, 0)が部屋の手前の壁際になるようにする(正面は -Z)
export const ROOM_SIZE = 6;
export const WALL_THICKNESS = 0.25;
export const ROOM_CENTER_Z = -2;

const HALF = ROOM_SIZE / 2;
const WALL_CENTER = HALF + WALL_THICKNESS / 2;
/** 室内側の壁面の位置(x は ±ROOM_INNER_X、z は ROOM_INNER_Z_NORTH〜ROOM_INNER_Z_SOUTH) */
export const ROOM_INNER_X = HALF;
export const ROOM_INNER_Z_NORTH = ROOM_CENTER_Z - HALF;
export const ROOM_INNER_Z_SOUTH = ROOM_CENTER_Z + HALF;

/** 左(-X)の壁の窓。専用のジオメトリを別で作るので、今は何もはめない正方形の空洞 */
export const WINDOW_SIZE = 2;
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

/**
 * 部屋を囲む壁と天井。左の壁には窓の空洞を空ける。
 * 壁は、隣の壁・床・天井の中まで延ばして重ねる(端と端を突き合わせるだけだと、隅の継ぎ目に 1px の隙間ができて外の空が線になって見える)
 */
export const ROOM_WALLS: readonly WallSpec[] = [
  // 奥(-Z)と手前(+Z)の壁は、角まで覆う
  {
    position: [0, HALF, ROOM_CENTER_Z - WALL_CENTER],
    size: [OUTER, OUTER, WALL_THICKNESS],
  },
  {
    position: [0, HALF, ROOM_CENTER_Z + WALL_CENTER],
    size: [OUTER, OUTER, WALL_THICKNESS],
  },
  // 右(+X)の壁
  {
    position: [WALL_CENTER, HALF, ROOM_CENTER_Z],
    size: [WALL_THICKNESS, OUTER, OUTER],
  },
  // 左(-X)の壁: 窓の下・上・奥側・手前側の 4 枚
  {
    position: [
      -WALL_CENTER,
      (WINDOW_SILL_HEIGHT - WALL_THICKNESS) / 2,
      ROOM_CENTER_Z,
    ],
    size: [WALL_THICKNESS, WINDOW_SILL_HEIGHT + WALL_THICKNESS, OUTER],
  },
  {
    position: [
      -WALL_CENTER,
      (windowTop + ROOM_SIZE + WALL_THICKNESS) / 2,
      ROOM_CENTER_Z,
    ],
    size: [WALL_THICKNESS, ROOM_SIZE + WALL_THICKNESS - windowTop, OUTER],
  },
  besideWindow(ROOM_INNER_Z_NORTH - WALL_THICKNESS, windowNorthZ),
  besideWindow(windowSouthZ, ROOM_INNER_Z_SOUTH + WALL_THICKNESS),
  // 天井
  {
    position: [0, ROOM_SIZE + WALL_THICKNESS / 2, ROOM_CENTER_Z],
    size: [OUTER, WALL_THICKNESS, OUTER],
  },
];

/** 窓を非表示にしたときに、窓の空洞をふさぐ壁板(空洞とちょうど同じ大きさ) */
export const WINDOW_PLUG: WallSpec = {
  position: [
    -WALL_CENTER,
    WINDOW_SILL_HEIGHT + WINDOW_SIZE / 2,
    WINDOW_CENTER_Z,
  ],
  size: [WALL_THICKNESS, WINDOW_SIZE, WINDOW_SIZE],
};

// オブジェクトの置き場所(足元の位置)。スケッチどおり、ディレクトリは奥の壁、キャンバスは右の壁際(スポーン地点を向く)、
// 机は部屋の中央、イスは机の手前(+Z 側)で机の方(-Z)を向く。
// ディレクトリは small の山を、奥の壁の室内の面から DIRECTORY_SINK 奥(壁の向こう)に中心を置く。
// 山(束の端まで mountainReach("small") = 2.4m)は、室内には 1.9m だけ張り出す。
// 机の奥の縁(z=-2.4)と山の端(z=-3.1)は 0.5m 以上空く
const DIRECTORY_SINK = 0.5;
export const DIRECTORY_POSITION: Vec3 = [
  0,
  0,
  ROOM_INNER_Z_NORTH - DIRECTORY_SINK,
];
export const WORKSPACE_POSITION: Vec3 = [0, 0, ROOM_CENTER_Z];
// キャンバスは斜めに向けるので、隅に寄せると右の壁と山の裾にはみ出す。両方から離れる、右の壁際の机寄りに置く
export const CANVAS_POSITION: Vec3 = [2.1, 0, -3.2];
/** スポーン地点(足元)。正面は -Z */
export const ROOM_SPAWN_POSITION: Vec3 = [0, 0.05, 0];
/** キャンバスの向き。壁に正対させず、絵の面(既定は +Z)をスポーン地点へ向ける */
export const CANVAS_YAW = Math.atan2(
  ROOM_SPAWN_POSITION[0] - CANVAS_POSITION[0],
  ROOM_SPAWN_POSITION[2] - CANVAS_POSITION[2],
);
export const CHAIR_POSITION: Vec3 = [0, 0, ROOM_CENTER_Z + 0.95];
/**
 * PC は机の天板の上。モデルの原点が「天板の中心」なので、机の中心からほんの少し奥へ寄せるだけにする
 * (それ以上ずらすと、タワーやモニタの台座が奥の縁から落ちる。机に載る部品の z の張り出しは
 *  後ろ 0.36m・手前 0.41m。CRT の管の後端は高い所にあるので、縁から少し出るのは許す)
 */
export const PC_POSITION: Vec3 = [
  WORKSPACE_POSITION[0],
  DESK_HEIGHT,
  WORKSPACE_POSITION[2] - 0.03,
];

/** ライターの置き場は机の天板の右手前(机は回さないので、机ローカルの LIGHTER_STAND_ON_DESK を足すだけ) */
export const LIGHTER_STAND_POSITION: Vec3 = [
  WORKSPACE_POSITION[0] + LIGHTER_STAND_ON_DESK[0],
  WORKSPACE_POSITION[1] + LIGHTER_STAND_ON_DESK[1],
  WORKSPACE_POSITION[2] + LIGHTER_STAND_ON_DESK[2],
];

/**
 * room に置くオブジェクトのレイアウト。項目名(directory・workspace・canvas・pc・lighter_stand)がトグルのキーになる
 * (例: directory:overview は俯瞰の機能)。ディレクトリは room のような狭い部屋用に small の山
 */
export const ROOM_LAYOUT: SceneLayout = {
  directory: directoryItem({
    id: "directory-1",
    position: DIRECTORY_POSITION,
    look: "small",
  }),
  workspace: {id: "workspace-1", position: WORKSPACE_POSITION},
  canvas: {id: "canvas-1", position: CANVAS_POSITION, yaw: CANVAS_YAW},
  pc: {id: "pc-1", position: PC_POSITION},
  lighter_stand: {id: "lighter_stand-1", position: LIGHTER_STAND_POSITION},
};
