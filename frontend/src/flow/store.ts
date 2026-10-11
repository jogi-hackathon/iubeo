import {useSyncExternalStore} from "react";

import {createApiClient} from "../net";
import {
  createGameFlow,
  type FlowNavigator,
  type GameFlowState,
} from "./gameFlow";

let navigator: FlowNavigator = {enter: () => {}};

export const bindNavigator = (next: FlowNavigator): (() => void) => {
  navigator = next;
  return () => {
    if (navigator === next) {
      navigator = {enter: () => {}};
    }
  };
};

export const gameFlow = createGameFlow({
  api: createApiClient(),
  navigator: {enter: (scene) => navigator.enter(scene)},
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

export const useGameFlow = (): GameFlowState =>
  useSyncExternalStore(gameFlow.subscribe, gameFlow.getState);
