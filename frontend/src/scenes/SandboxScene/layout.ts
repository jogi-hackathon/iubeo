import {
  directoryItem,
  type LayoutItem,
  type SceneLayout,
} from "../../objects/layout";
import {LIGHTER_STAND_ON_DESK} from "../../objects/lighter_stand/stand";
import {ON_DESK as PC_PLACEMENT} from "../../objects/pc/dimensions";
import {DESK_HEIGHT, TOP_SIZE} from "../../objects/workspace/desk";
import type {SlabSpec} from "../../props/slabGeometry";
import type {Vec3} from "../../props/types";
import type {Spawn} from "../spawn";

const SQRT3 = Math.sqrt(3);

export const SANDBOX_SIDE = 24;
export const SANDBOX_INRADIUS = SANDBOX_SIDE / (2 * SQRT3);
export const SANDBOX_CIRCUMRADIUS = 2 * SANDBOX_INRADIUS;
export const WALL_THICKNESS = 0.25;
export const PARTITION_THICKNESS = 0.08;
export const WALL_HEIGHT = 6;
export const APEX_HEIGHT = 12;
export const ZONE_COUNT = 3;

const t = WALL_THICKNESS;
const pt = PARTITION_THICKNESS;
const r = SANDBOX_INRADIUS;
const OUTER_INRADIUS = r + t;
const OUTER_HALF_WIDTH = SQRT3 * OUTER_INRADIUS;
const OUTER_CIRCUMRADIUS = 2 * OUTER_INRADIUS;

export const seatYaw = (seat: number): number =>
  ((seat - 1) * 2 * Math.PI) / ZONE_COUNT;

export const rotateY = ([x, y, z]: Vec3, yaw: number): Vec3 => {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [x * cos + z * sin, y, -x * sin + z * cos];
};

export type Placement = {position: Vec3; yaw: number};

export const toWorld = (local: Placement, seat: number): Placement => ({
  position: rotateY(local.position, seatYaw(seat)),
  yaw: local.yaw + seatYaw(seat),
});

export type WallSpec = {position: Vec3; size: Vec3};

export const WINDOW_SIZE = 2;
export const WINDOW_SILL_HEIGHT = 1;
export const WINDOW_CENTER_X = 0;
export const WALL_INNER_HALF_WIDTH = SQRT3 * r - pt;

const windowLeft = WINDOW_CENTER_X - WINDOW_SIZE / 2;
const windowRight = WINDOW_CENTER_X + WINDOW_SIZE / 2;
const windowTop = WINDOW_SILL_HEIGHT + WINDOW_SIZE;
const wallCenterZ = r + t / 2;

const besideWindow = (xFrom: number, xTo: number): WallSpec => ({
  position: [
    (xFrom + xTo) / 2,
    WINDOW_SILL_HEIGHT + WINDOW_SIZE / 2,
    wallCenterZ,
  ],
  size: [xTo - xFrom, WINDOW_SIZE, t],
});

const WALL_ROOF_OVERLAP = 0.1;
const wallTop = WALL_HEIGHT + WALL_ROOF_OVERLAP;

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

export const ZONE_WINDOW_BLOCKER: WallSpec = {
  position: [
    WINDOW_CENTER_X,
    WINDOW_SILL_HEIGHT + WINDOW_SIZE / 2,
    wallCenterZ,
  ],
  size: [WINDOW_SIZE, WINDOW_SIZE, t],
};

export const ZONE_FLOOR_TILE = 2;

export const ZONE_FLOOR: SlabSpec = {
  polygon: [
    [0, 0, 0],
    [-OUTER_HALF_WIDTH, 0, OUTER_INRADIUS],
    [OUTER_HALF_WIDTH, 0, OUTER_INRADIUS],
  ],
  offset: [0, -t, 0],
};

const PARTITION_DIRECTION = [-SQRT3 / 2, 1 / 2] as const;
export const PARTITION_AXIS: Vec3 = [
  PARTITION_DIRECTION[0],
  0,
  PARTITION_DIRECTION[1],
];
const PARTITION_NORMAL = [1 / 2, SQRT3 / 2] as const;

const ROOF_SLOPE = (APEX_HEIGHT - WALL_HEIGHT) / r;

export const ridgeHeight = (s: number): number =>
  APEX_HEIGHT - ((APEX_HEIGHT - WALL_HEIGHT) * s) / SANDBOX_CIRCUMRADIUS;

const partitionPoint = (s: number, y: number, side: -1 | 1): Vec3 => [
  s * PARTITION_DIRECTION[0] + (side * pt * PARTITION_NORMAL[0]) / 2,
  y,
  s * PARTITION_DIRECTION[1] + (side * pt * PARTITION_NORMAL[1]) / 2,
];

export const ZONE_PARTITION: SlabSpec = {
  polygon: [
    partitionPoint(0, 0, -1),
    partitionPoint(OUTER_CIRCUMRADIUS, 0, -1),
    partitionPoint(OUTER_CIRCUMRADIUS, ridgeHeight(OUTER_CIRCUMRADIUS), -1),
    partitionPoint(0, APEX_HEIGHT, -1),
  ],
  offset: [pt * PARTITION_NORMAL[0], 0, pt * PARTITION_NORMAL[1]],
};

const roofNormalLength = Math.hypot(1, ROOF_SLOPE);
const roofEaveHeight = APEX_HEIGHT - ROOF_SLOPE * OUTER_INRADIUS;

export const ZONE_ROOF: SlabSpec = {
  polygon: [
    [0, APEX_HEIGHT, 0],
    [-OUTER_HALF_WIDTH, roofEaveHeight, OUTER_INRADIUS],
    [OUTER_HALF_WIDTH, roofEaveHeight, OUTER_INRADIUS],
  ],
  offset: [0, t / roofNormalLength, (t * ROOF_SLOPE) / roofNormalLength],
};

const DESK_WALL_GAP = 0.15;
const WORKSPACE_Z = r - TOP_SIZE[2] / 2 - DESK_WALL_GAP;

export const ZONE_WORKSPACE: Placement = {
  position: [3.5, 0, WORKSPACE_Z],
  yaw: Math.PI,
};
export const ZONE_CHAIR: Placement = {
  position: [3.5, 0, WORKSPACE_Z - 0.95],
  yaw: Math.PI,
};
const onDesk = (local: Vec3, yaw = 0): Placement => {
  const offset = rotateY(local, ZONE_WORKSPACE.yaw);
  return {
    position: [
      ZONE_WORKSPACE.position[0] + offset[0],
      ZONE_WORKSPACE.position[1] + offset[1],
      ZONE_WORKSPACE.position[2] + offset[2],
    ],
    yaw: ZONE_WORKSPACE.yaw + yaw,
  };
};
export const PC_ON_DESK: Vec3 = [PC_PLACEMENT.x, DESK_HEIGHT, PC_PLACEMENT.z];
export const ZONE_PC: Placement = onDesk(PC_ON_DESK, PC_PLACEMENT.yaw);
export const ZONE_LIGHTER_STAND: Placement = onDesk(LIGHTER_STAND_ON_DESK);
export const ZONE_SPAWN: Placement = {position: [0, 0.05, r - 2], yaw: 0};

const CANVAS_POSITION: Vec3 = [-4, 0, r - 3];
export const ZONE_CANVAS: Placement = {
  position: CANVAS_POSITION,
  yaw: Math.atan2(
    ZONE_SPAWN.position[0] - CANVAS_POSITION[0],
    ZONE_SPAWN.position[2] - CANVAS_POSITION[2],
  ),
};

export const SEATS = [1, 2, 3] as const;

export const sandboxSpawnOf = (seat: number): Spawn => {
  const {position, yaw} = toWorld(ZONE_SPAWN, seat);
  return {position, yaw};
};

const seatItems = (seat: number): [string, LayoutItem][] => {
  const place = (kind: string, local: Placement): [string, LayoutItem] => {
    const world = toWorld(local, seat);
    const name = `${kind}-${seat}`;
    return [name, {id: name, position: world.position, yaw: world.yaw}];
  };
  return [
    place("workspace", ZONE_WORKSPACE),
    place("pc", ZONE_PC),
    place("canvas", ZONE_CANVAS),
    place("lighter_stand", ZONE_LIGHTER_STAND),
  ];
};

export const SANDBOX_LAYOUT: SceneLayout = Object.fromEntries([
  [
    "directory",
    directoryItem({id: "directory-1", position: [0, 0, 0], look: "large"}),
  ],
  ...SEATS.flatMap(seatItems),
]);
