import type {ComponentType} from "react";

import {RoomScene} from "./RoomScene";
import {SandboxScene} from "./SandboxScene";
import {TestScene} from "./TestScene";

const coreScenes = {room: RoomScene, sandbox: SandboxScene} as const;
// 開発時のみ加えるシーン(package.json の devDependencies と同じ考え方)。
// 本番では登録されず、TestScene 以下はバンドルからも落ちる
const devScenes = {test: TestScene} as const;

export type SceneName = keyof typeof coreScenes | keyof typeof devScenes;

/** 現在のビルドで使えるシーン(本番は test を含まない) */
export const scenes: {readonly [K in SceneName]?: ComponentType} = {
  ...coreScenes,
  ...(import.meta.env.DEV ? devScenes : {}),
};

export const sceneNames = Object.keys(scenes) as SceneName[];
