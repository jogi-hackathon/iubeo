import { TestScene } from "./TestScene";

export const scenes = { test: TestScene } as const;

export type SceneName = keyof typeof scenes;
