import type {ComponentType} from "react";

import {START_POSITION} from "../player/constants";
import {MultiplayerTestScene} from "./MultiplayerTestScene";
import {RoomScene} from "./RoomScene";
import {ROOM_SPAWN_POSITION} from "./RoomScene/layout";
import {SandboxScene} from "./SandboxScene";
import type {Spawn} from "./spawn";
import {TestScene} from "./TestScene";

const coreScenes = {room: RoomScene, sandbox: SandboxScene} as const;
// 開発時のみ加えるシーン(package.json の devDependencies と同じ考え方)。
// 本番では登録されず、TestScene・MultiplayerTestScene 以下はバンドルからも落ちる
const devScenes = {
  test: TestScene,
  multiplayer: MultiplayerTestScene,
} as const;

export type SceneName = keyof typeof coreScenes | keyof typeof devScenes;

/** 現在のビルドで使えるシーン(本番は test を含まない) */
export const scenes: {readonly [K in SceneName]?: ComponentType} = {
  ...coreScenes,
  ...(import.meta.env.DEV ? devScenes : {}),
};

export const sceneNames = Object.keys(scenes) as SceneName[];

/**
 * シーンごとのスポーン地点(シーンに入ったときのプレイヤーの位置と向き)。無いシーンは START_POSITION・yaw 0。
 * room は床の上(足元 y=0 のすぐ上)から、正面の -Z 向きに始める
 */
export const sceneSpawn: {readonly [K in SceneName]?: Spawn} = {
  room: {position: [...ROOM_SPAWN_POSITION], yaw: 0},
};

export const spawnOf = (scene: SceneName): Spawn =>
  sceneSpawn[scene] ?? {position: [...START_POSITION], yaw: 0};
