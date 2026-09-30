import {useSyncExternalStore} from "react";

import type {SceneState} from "./sceneManager";
import {sceneManager} from "./sceneStore";

export const useSceneState = (): SceneState =>
  useSyncExternalStore(sceneManager.subscribe, sceneManager.getState);
