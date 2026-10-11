import type {ComponentType} from "react";

import {START_POSITION} from "../player/constants";
import {RoomScene} from "./RoomScene";
import {ROOM_SPAWN_POSITION} from "./RoomScene/layout";
import {SandboxScene} from "./SandboxScene";
import {sandboxSpawnOf} from "./SandboxScene/layout";
import type {Spawn} from "./spawn";
import {TestScene} from "./TestScene";

const coreScenes = {room: RoomScene, sandbox: SandboxScene} as const;
const devScenes = {test: TestScene} as const;

export type SceneName = keyof typeof coreScenes | keyof typeof devScenes;

export const scenes: {readonly [K in SceneName]?: ComponentType} = {
  ...coreScenes,
  ...(import.meta.env.DEV ? devScenes : {}),
};

export const sceneNames = Object.keys(scenes) as SceneName[];

export const sceneSpawn: {readonly [K in SceneName]?: Spawn} = {
  room: {position: [...ROOM_SPAWN_POSITION], yaw: 0},
  sandbox: sandboxSpawnOf(1),
};

export const spawnOf = (scene: SceneName): Spawn =>
  sceneSpawn[scene] ?? {position: [...START_POSITION], yaw: 0};
