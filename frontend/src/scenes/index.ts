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

/** 現在のビルドで使えるシーン(本番は test を含まない) */
export const scenes: {readonly [K in SceneName]?: ComponentType} = {
  ...coreScenes,
  ...(import.meta.env.DEV ? devScenes : {}),
};

export const sceneNames = Object.keys(scenes) as SceneName[];

/**
 * シーンごとのスポーン地点(シーンに入ったときのプレイヤーの位置と向き)。無いシーンは START_POSITION・yaw 0。
 * room は床の上(足元 y=0 のすぐ上)から、正面の -Z 向きに始める。
 * sandbox は座席 1 のスポーン地点(セッション無しで入ったときの置き場所。セッションに入るときは、ServerAuthority が最初の snapshot で自分の席の sandboxSpawnOf に置き直す)
 */
export const sceneSpawn: {readonly [K in SceneName]?: Spawn} = {
  room: {position: [...ROOM_SPAWN_POSITION], yaw: 0},
  sandbox: sandboxSpawnOf(1),
};

export const spawnOf = (scene: SceneName): Spawn =>
  sceneSpawn[scene] ?? {position: [...START_POSITION], yaw: 0};
