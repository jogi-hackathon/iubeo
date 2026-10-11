import {useStore} from "../core/storage";
import {type TutorialState, tutorialStore} from "./tutorialStore";

export const useTutorial = (): Readonly<TutorialState> =>
  useStore(tutorialStore);
