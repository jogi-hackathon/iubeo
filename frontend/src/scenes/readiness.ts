import {gameFlow} from "../flow/store";
import type {SceneName} from "./index";

export type SceneReadiness = "authority" | "mount";

type ReadinessRule = SceneReadiness | (() => SceneReadiness);

export const sceneReadiness = {
  room: "authority",
  sandbox: () => (gameFlow.currentSession() ? "authority" : "mount"),
  test: "authority",
} as const satisfies Record<SceneName, ReadinessRule>;

export const readinessOf = (scene: SceneName): SceneReadiness => {
  const rule: ReadinessRule = sceneReadiness[scene];
  return typeof rule === "function" ? rule() : rule;
};
