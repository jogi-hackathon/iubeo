import {useSyncExternalStore} from "react";

import type {SceneState} from "./sceneManager";
import {sceneManager, sceneTransitionManager} from "./sceneStore";
import type {TransitionState} from "./sceneTransitionManager";

/** 今のシーン(演出中は commit 前なので、前のシーンのまま) */
export const useSceneState = (): SceneState =>
  useSyncExternalStore(sceneManager.subscribe, sceneManager.getState);

/** シーン遷移の状態(idle / transitioning) */
export const useTransitionState = (): TransitionState =>
  useSyncExternalStore(
    sceneTransitionManager.subscribe,
    sceneTransitionManager.getState,
  );
