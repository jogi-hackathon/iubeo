import {useSyncExternalStore} from "react";

import {createTutorialManager, type TutorialFlowState} from "./tutorialManager";
import {type TutorialEvent, TUTORIAL_STEPS} from "./tutorialSteps";
import {tutorialStore} from "./tutorialStore";

export const tutorialManager = createTutorialManager<TutorialEvent>({
  steps: TUTORIAL_STEPS,
  store: tutorialStore,
});

export const useTutorialFlow = (): TutorialFlowState<TutorialEvent> =>
  useSyncExternalStore(tutorialManager.subscribe, tutorialManager.getState);
