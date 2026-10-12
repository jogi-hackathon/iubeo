import {
  directoryItem,
  pcItem,
  type SceneLayout,
  workspaceItem,
} from "../../objects/layout";
import {ON_DESK as PC_ON_DESK} from "../../objects/pc/dimensions";
import {DESK_HEIGHT} from "../../objects/workspace/desk";
import type {Vec3} from "../../props/types";

export const ROOM_SIZE = 6;
export const WALL_THICKNESS = 0.25;
export const ROOM_CENTER_Z = -2;

const HALF = ROOM_SIZE / 2;
const WALL_CENTER = HALF + WALL_THICKNESS / 2;
export const ROOM_INNER_X = HALF;
export const ROOM_INNER_Z_NORTH = ROOM_CENTER_Z - HALF;
export const ROOM_INNER_Z_SOUTH = ROOM_CENTER_Z + HALF;

export const WINDOW_SIZE = 2;
export const WINDOW_SILL_HEIGHT = 1;
export const WINDOW_CENTER_Z = ROOM_CENTER_Z;

export type WallSpec = {position: Vec3; size: Vec3};

const OUTER = ROOM_SIZE + 2 * WALL_THICKNESS;
const windowTop = WINDOW_SILL_HEIGHT + WINDOW_SIZE;
const windowSouthZ = WINDOW_CENTER_Z + WINDOW_SIZE / 2;
const windowNorthZ = WINDOW_CENTER_Z - WINDOW_SIZE / 2;

const besideWindow = (zFrom: number, zTo: number): WallSpec => ({
  position: [
    -WALL_CENTER,
    WINDOW_SILL_HEIGHT + WINDOW_SIZE / 2,
    (zFrom + zTo) / 2,
  ],
  size: [WALL_THICKNESS, WINDOW_SIZE, zTo - zFrom],
});

export const ROOM_FLOOR_TILE = 1;

export const ROOM_FLOOR: WallSpec = {
  position: [0, -WALL_THICKNESS / 2, ROOM_CENTER_Z],
  size: [OUTER, WALL_THICKNESS, OUTER],
};

export const ROOM_WALLS: readonly WallSpec[] = [
  {
    position: [0, HALF, ROOM_CENTER_Z - WALL_CENTER],
    size: [OUTER, OUTER, WALL_THICKNESS],
  },
  {
    position: [0, HALF, ROOM_CENTER_Z + WALL_CENTER],
    size: [OUTER, OUTER, WALL_THICKNESS],
  },
  {
    position: [WALL_CENTER, HALF, ROOM_CENTER_Z],
    size: [WALL_THICKNESS, OUTER, OUTER],
  },
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
  {
    position: [0, ROOM_SIZE + WALL_THICKNESS / 2, ROOM_CENTER_Z],
    size: [OUTER, WALL_THICKNESS, OUTER],
  },
];

export const WINDOW_PLUG: WallSpec = {
  position: [
    -WALL_CENTER,
    WINDOW_SILL_HEIGHT + WINDOW_SIZE / 2,
    WINDOW_CENTER_Z,
  ],
  size: [WALL_THICKNESS, WINDOW_SIZE, WINDOW_SIZE],
};

export const DIRECTORY_POSITION: Vec3 = [0, 0, ROOM_INNER_Z_NORTH];
export const WORKSPACE_POSITION: Vec3 = [0, 0, ROOM_CENTER_Z];
export const CANVAS_POSITION: Vec3 = [2.1, 0, -3.2];
export const ROOM_SPAWN_POSITION: Vec3 = [0, 0.05, 0];
export const CANVAS_YAW = Math.atan2(
  ROOM_SPAWN_POSITION[0] - CANVAS_POSITION[0],
  ROOM_SPAWN_POSITION[2] - CANVAS_POSITION[2],
);
export const CHAIR_POSITION: Vec3 = [0, 0, ROOM_CENTER_Z + 0.95];
export const PC_POSITION: Vec3 = [
  WORKSPACE_POSITION[0] + PC_ON_DESK.x,
  DESK_HEIGHT,
  WORKSPACE_POSITION[2] + PC_ON_DESK.z,
];
export const PC_YAW = PC_ON_DESK.yaw;

export const ROOM_LAYOUT: SceneLayout = {
  directory: directoryItem({
    id: "directory-1",
    position: DIRECTORY_POSITION,
    look: "small",
  }),
  workspace: workspaceItem({
    id: "workspace-1",
    position: WORKSPACE_POSITION,
    memo: false,
  }),
  canvas: {id: "canvas-1", position: CANVAS_POSITION, yaw: CANVAS_YAW},
  pc: pcItem({
    id: "pc-1",
    position: PC_POSITION,
    yaw: PC_YAW,
    program: "desktop",
  }),
};
