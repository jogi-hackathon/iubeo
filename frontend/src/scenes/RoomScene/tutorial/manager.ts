import {useSyncExternalStore} from "react";

import {
  createTutorialManager,
  type TutorialFlowState,
  tutorialStore,
} from "../../../tutorial";
import {type TutorialEvent, TUTORIAL_STEPS} from "./steps";

export const tutorialManager = createTutorialManager<TutorialEvent>({
  steps: TUTORIAL_STEPS,
  store: tutorialStore,
});

export const useTutorialFlow = (): TutorialFlowState<TutorialEvent> =>
  useSyncExternalStore(tutorialManager.subscribe, tutorialManager.getState);
