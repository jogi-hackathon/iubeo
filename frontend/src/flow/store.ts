import {useSyncExternalStore} from "react";

import {createApiClient} from "../net";
import {
  createGameFlow,
  type FlowNavigator,
  type GameFlowState,
} from "./gameFlow";

let navigator: FlowNavigator = {enter: () => {}};

/** シーンの移動を結ぶ(scenes/sceneStore.ts が呼ぶ)。戻り値で外す */
export const bindNavigator = (next: FlowNavigator): (() => void) => {
  navigator = next;
  return () => {
    if (navigator === next) {
      navigator = {enter: () => {}};
    }
  };
};

/** アプリ全体で 1 つのゲームの流れ */
export const gameFlow = createGameFlow({
  api: createApiClient(),
  navigator: {enter: (scene) => navigator.enter(scene)},
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

export const useGameFlow = (): GameFlowState =>
  useSyncExternalStore(gameFlow.subscribe, gameFlow.getState);
