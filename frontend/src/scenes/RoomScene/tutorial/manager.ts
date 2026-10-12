import {useSyncExternalStore} from "react";

import {
  createTutorialManager,
  type TutorialFlowState,
  tutorialStore,
} from "../../../tutorial";
import {type TutorialEvent, TUTORIAL_STEPS} from "./steps";

/** 部屋のチュートリアルの進行(手順は ./steps)。dev パネルからも進めたり戻したりする */
export const tutorialManager = createTutorialManager<TutorialEvent>({
  steps: TUTORIAL_STEPS,
  store: tutorialStore,
});

export const useTutorialFlow = (): TutorialFlowState<TutorialEvent> =>
  useSyncExternalStore(tutorialManager.subscribe, tutorialManager.getState);
