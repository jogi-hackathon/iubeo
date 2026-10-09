import type {MountainSizeName} from "../../objects/directory/mountain";
import {DESK_HEIGHT, TOP_SIZE} from "../../objects/workspace/desk";
import type {SlabSpec} from "../../props/slabGeometry";
import type {Vec3} from "../../props/types";
import type {Spawn} from "../spawn";

// サンドボックスは、正三角形の床の上の「正三角柱 + 三角錐の屋根」(3 人用)。3 人それぞれの区画は、中心から 3 つの頂点へ引いた仕切り(壁より薄いすりガラスの板)で区切った三角形。
// 座標は、部屋の中心(三角形の重心)が原点、床の上面が y=0。
// 区画 k(0, 1, 2)は、「区画ローカル座標」を Y 軸まわりに zoneYaw(k) = k * 2π/3 回したもの(three の rotation.y と同じ向き)。区画 0 はローカル=ワールド。
// 区画ローカルでは、外壁が +Z 側、中心(ディレクトリの山)が原点で、区画は三角形 (0, 0)・(-SIDE/2, r)・(SIDE/2, r) の室内。
// 区画の部品(床・外壁・仕切り・屋根・イス)は、ローカル座標の値をそのまま 1 つの group(rotation = zoneYaw)に入れて回す
const SQRT3 = Math.sqrt(3);

/** 室内の正三角形の一辺 */
export const SANDBOX_SIDE = 24;
/** 室内の三角形の内接円の半径 r。外壁の室内側の面は、区画ローカルの z=r(≈ 6.93) */
export const SANDBOX_INRADIUS = SANDBOX_SIDE / (2 * SQRT3);
/** 中心から室内の頂点までの距離 R = 2r。仕切りは、中心から頂点へ向かう */
export const SANDBOX_CIRCUMRADIUS = 2 * SANDBOX_INRADIUS;
export const WALL_THICKNESS = 0.25;
/** 仕切り(すりガラスの板)の厚さ。壁・床・屋根(WALL_THICKNESS)より薄い */
export const PARTITION_THICKNESS = 0.08;
/** 外壁の高さ。屋根は、外壁の室内側の上端から立ち上がる */
export const WALL_HEIGHT = 6;
/** 屋根の室内側の面の頂点(中心の真上)の高さ。ディレクトリの俯瞰カメラ(山の中心の真上)より高い */
export const APEX_HEIGHT = 12;
export const ZONE_COUNT = 3;

const t = WALL_THICKNESS;
const pt = PARTITION_THICKNESS;
const r = SANDBOX_INRADIUS;
/** 外壁・床・屋根の外側の面まで含めた三角形(外壁の厚み t の分、外へ広がる): 内接円の半径・外壁の x の半幅・頂点までの距離 */
const OUTER_INRADIUS = r + t;
const OUTER_HALF_WIDTH = SQRT3 * OUTER_INRADIUS;
const OUTER_CIRCUMRADIUS = 2 * OUTER_INRADIUS;

/** 区画 index の、ローカルからワールドへの回転(Y 軸まわり、ラジアン) */
export const zoneYaw = (zone: number): number =>
  (zone * 2 * Math.PI) / ZONE_COUNT;

/** ベクトルを Y 軸まわりに yaw 回す(three の rotation.y と同じ向き。yaw=0 で変わらず、+π/2 で +Z が +X へ向く) */
export const rotateY = ([x, y, z]: Vec3, yaw: number): Vec3 => {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [x * cos + z * sin, y, -x * sin + z * cos];
};

/** 位置と向き(足元の位置と、Y 軸まわりの向き) */
export type Placement = {position: Vec3; yaw: number};

/** 区画ローカルの位置・向きを、区画 zone の分だけ回してワールドへ置く(ワールドの yaw = ローカルの yaw + zoneYaw) */
export const toWorld = (local: Placement, zone: number): Placement => ({
  position: rotateY(local.position, zoneYaw(zone)),
  yaw: local.yaw + zoneYaw(zone),
});

/** 直方体の壁。position は中心(区画ローカル) */
export type WallSpec = {position: Vec3; size: Vec3};

/** 窓は room と同じ大きさ(2m 四方、下端 1m)で、外壁の中央(区画の真ん中)。専用のジオメトリはまだ無く、何もはめない空洞 */
export const WINDOW_SIZE = 2;
export const WINDOW_SILL_HEIGHT = 1;
export const WINDOW_CENTER_X = 0;
/** 外壁の室内側の面の、x の半幅(左右の仕切りの面と外壁が交わる位置。仕切りの厚みの分、頂点より内側) */
export const WALL_INNER_HALF_WIDTH = SQRT3 * r - pt;

const windowLeft = WINDOW_CENTER_X - WINDOW_SIZE / 2;
const windowRight = WINDOW_CENTER_X + WINDOW_SIZE / 2;
const windowTop = WINDOW_SILL_HEIGHT + WINDOW_SIZE;
const wallCenterZ = r + t / 2;

/** 窓の脇の壁。x は (xFrom, xTo) の範囲、y は窓の高さ */
const besideWindow = (xFrom: number, xTo: number): WallSpec => ({
  position: [
    (xFrom + xTo) / 2,
    WINDOW_SILL_HEIGHT + WINDOW_SIZE / 2,
    wallCenterZ,
  ],
  size: [xTo - xFrom, WINDOW_SIZE, t],
});

/**
 * 外壁の上端を屋根の板の中へ延ばす量(m)。外壁の上端と屋根の室内面を突き合わせるだけだと、継ぎ目に 1px の隙間ができて外の空が線になって見える。
 * 外壁の外面(z=r+t)での屋根の板の上面(WALL_HEIGHT + 約 0.11)を超えない
 */
const WALL_ROOF_OVERLAP = 0.1;
const wallTop = WALL_HEIGHT + WALL_ROOF_OVERLAP;

/**
 * 区画の外壁(z∈[r, r+t]、外側の頂点まで)。窓の空洞を空けるので、窓の下・上・左・右の 4 つの箱に分ける。
 * 下端は床の板の中(y=-t)まで、上端は屋根の板の中まで延ばす(継ぎ目の隙間をなくす)
 */
export const ZONE_WALLS: readonly WallSpec[] = [
  {
    position: [0, (WINDOW_SILL_HEIGHT - t) / 2, wallCenterZ],
    size: [2 * OUTER_HALF_WIDTH, WINDOW_SILL_HEIGHT + t, t],
  },
  {
    position: [0, (windowTop + wallTop) / 2, wallCenterZ],
    size: [2 * OUTER_HALF_WIDTH, wallTop - windowTop, t],
  },
  besideWindow(-OUTER_HALF_WIDTH, windowLeft),
  besideWindow(windowRight, OUTER_HALF_WIDTH),
];

/** 区画の床。三角形 (0, 0)・外側の頂点 (±OUTER_HALF_WIDTH, r+t) の板で、上面が y=0、厚さ t(共通の TiledFloor は使わない) */
export const ZONE_FLOOR: SlabSpec = {
  polygon: [
    [0, 0, 0],
    [-OUTER_HALF_WIDTH, 0, OUTER_INRADIUS],
    [OUTER_HALF_WIDTH, 0, OUTER_INRADIUS],
  ],
  offset: [0, -t, 0],
};

/** 仕切りが中心から頂点へ向かう向き (x, z)(区画ローカルで、区画の左の頂点 (-SIDE/2, r) への単位ベクトル) */
const PARTITION_DIRECTION = [-SQRT3 / 2, 1 / 2] as const;
/** 仕切りの面の、水平方向の軸(区画ローカルの単位ベクトル。PARTITION_DIRECTION を 3 次元にしたもの)。すりガラスの面内座標(模様・格子)の横軸 */
export const PARTITION_AXIS: Vec3 = [
  PARTITION_DIRECTION[0],
  0,
  PARTITION_DIRECTION[1],
];
/** 仕切りの面の法線 (x, z)(区画の内側を向く) */
const PARTITION_NORMAL = [1 / 2, SQRT3 / 2] as const;

/** 屋根の室内側の面の高さの勾配。外壁の室内側の上端 (z=r, y=WALL_HEIGHT) と頂点 (0, APEX_HEIGHT, 0) を通る面は、z が 1 進むごとにこれだけ下がる */
const ROOF_SLOPE = (APEX_HEIGHT - WALL_HEIGHT) / r;

/**
 * 仕切りの上端の高さ = 屋根の稜線(隣り合う屋根の室内側の面が交わる線)の、中心からの距離 s での高さ。
 * s=0(中心)で APEX_HEIGHT、s=R(室内の頂点)で WALL_HEIGHT
 */
export const ridgeHeight = (s: number): number =>
  APEX_HEIGHT - ((APEX_HEIGHT - WALL_HEIGHT) * s) / SANDBOX_CIRCUMRADIUS;

/** 仕切りの中心線の上の、中心からの距離 s・高さ y の点を、面の法線方向に side * p/2 ずらしたもの */
const partitionPoint = (s: number, y: number, side: -1 | 1): Vec3 => [
  s * PARTITION_DIRECTION[0] + (side * pt * PARTITION_NORMAL[0]) / 2,
  y,
  s * PARTITION_DIRECTION[1] + (side * pt * PARTITION_NORMAL[1]) / 2,
];

/**
 * 区画の左の仕切り(区画 k の左 = 区画 k-1 の右。3 区画で 3 枚)。中心から外側の頂点(s = OUTER_CIRCUMRADIUS)までの鉛直な面で、
 * 中心線に対して ±PARTITION_THICKNESS/2 の厚さ(壁より薄い、すりガラスの板)。下端は y=0、上端は屋根の稜線(ridgeHeight)。ディレクトリの山を貫く。
 * 描くのは FrostedPartition(すりガラス)で、当たり判定は残る(プレイヤーは自分の区画から出られない)
 */
export const ZONE_PARTITION: SlabSpec = {
  polygon: [
    partitionPoint(0, 0, -1),
    partitionPoint(OUTER_CIRCUMRADIUS, 0, -1),
    partitionPoint(OUTER_CIRCUMRADIUS, ridgeHeight(OUTER_CIRCUMRADIUS), -1),
    partitionPoint(0, APEX_HEIGHT, -1),
  ],
  offset: [pt * PARTITION_NORMAL[0], 0, pt * PARTITION_NORMAL[1]],
};

/** 屋根の室内側の面(y + ROOF_SLOPE * z = APEX_HEIGHT)の法線 (0, 1, ROOF_SLOPE) の長さ。押し出す向きを正規化する用 */
const roofNormalLength = Math.hypot(1, ROOF_SLOPE);
const roofEaveHeight = APEX_HEIGHT - ROOF_SLOPE * OUTER_INRADIUS;

/**
 * 区画の屋根。室内側の面が、外壁の室内側の上端と頂点 (0, APEX_HEIGHT, 0) を通る平面。その平面上の三角形
 * (頂点と、z=r+t まで延ばした底辺の両端)を、外向きの法線方向へ厚さ t だけ押し出した板
 */
export const ZONE_ROOF: SlabSpec = {
  polygon: [
    [0, APEX_HEIGHT, 0],
    [-OUTER_HALF_WIDTH, roofEaveHeight, OUTER_INRADIUS],
    [OUTER_HALF_WIDTH, roofEaveHeight, OUTER_INRADIUS],
  ],
  offset: [0, t / roofNormalLength, (t * ROOF_SLOPE) / roofNormalLength],
};

// オブジェクトの置き場所(区画ローカル。ワールドへは toWorld で区画ごとに回して置く)。
// ディレクトリは全区画で 1 つ、中心(原点)の large の山。山は束の端まで mountainReach("large") = 4.4m で、3 区画にまたがり(仕切りが貫く)、室内の三角形(内接円の半径 r)の内側に収まる。
// 机は右(+x 側)の外壁に付けて、手前(イス側)を中心へ向ける。イスはその手前から外壁の方を向く。キャンバスは左寄りで、スポーン地点の方を向く。
// スポーン地点は、中心(ディレクトリ)の方(ローカルの -Z)を向く。イス・PC・キャンバスの足元は、room と同じ考え方
export const SANDBOX_DIRECTORY_POSITION: Vec3 = [0, 0, 0];
export const SANDBOX_DIRECTORY_SIZE: MountainSizeName = "large";

/** 机の奥の縁と外壁の室内側の面の間の隙間(m)。机の奥行き TOP_SIZE[2] の半分だけ、中心が壁から離れる */
const DESK_WALL_GAP = 0.15;
const WORKSPACE_Z = r - TOP_SIZE[2] / 2 - DESK_WALL_GAP;

export const ZONE_WORKSPACE: Placement = {
  position: [3.5, 0, WORKSPACE_Z],
  yaw: Math.PI,
};
/** イスは机の手前(中心側)で、外壁の方(机の方)を向く。room の CHAIR_POSITION と同じ 0.95m 手前 */
export const ZONE_CHAIR: Placement = {
  position: [3.5, 0, WORKSPACE_Z - 0.95],
  yaw: Math.PI,
};
/** PC は机の上の奥側(作業スペースの外)。机ローカルの (0, DESK_HEIGHT, -0.3) を机の向きで回して、机の位置へ足したもの。今は見た目が無く、データだけ */
const pcOffset = rotateY([0, DESK_HEIGHT, -0.3], ZONE_WORKSPACE.yaw);
export const ZONE_PC: Placement = {
  position: [
    ZONE_WORKSPACE.position[0] + pcOffset[0],
    ZONE_WORKSPACE.position[1] + pcOffset[1],
    ZONE_WORKSPACE.position[2] + pcOffset[2],
  ],
  yaw: ZONE_WORKSPACE.yaw,
};
/** スポーン地点(足元)。向きは中心の方(ローカルの -Z) */
export const ZONE_SPAWN: Placement = {position: [0, 0.05, r - 2], yaw: 0};

const CANVAS_POSITION: Vec3 = [-4, 0, r - 3];
/** キャンバスの向き。壁に正対させず、絵の面(既定は +Z)をスポーン地点へ向ける(room の CANVAS_YAW と同じ式) */
export const ZONE_CANVAS: Placement = {
  position: CANVAS_POSITION,
  yaw: Math.atan2(
    ZONE_SPAWN.position[0] - CANVAS_POSITION[0],
    ZONE_SPAWN.position[2] - CANVAS_POSITION[2],
  ),
};

const zoneSpawn = (zone: number): Spawn => {
  const {position, yaw} = toWorld(ZONE_SPAWN, zone);
  return {position, yaw};
};

/** 3 区画のスポーン地点(ワールド。将来のマルチプレイで、プレイヤーを自分の区画へ入れる用)。今のシーンの入り口は区画 0 */
export const SANDBOX_SPAWNS = [
  zoneSpawn(0),
  zoneSpawn(1),
  zoneSpawn(2),
] as const;
