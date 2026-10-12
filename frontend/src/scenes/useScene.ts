import {useSyncExternalStore} from "react";

import type {SceneState} from "./sceneManager";
import {sceneManager, sceneTransitionManager} from "./sceneStore";
import type {TransitionState} from "./sceneTransitionManager";

export const useSceneState = (): SceneState =>
  useSyncExternalStore(sceneManager.subscribe, sceneManager.getState);

export const useTransitionState = (): TransitionState =>
  useSyncExternalStore(
    sceneTransitionManager.subscribe,
    sceneTransitionManager.getState,
  );
