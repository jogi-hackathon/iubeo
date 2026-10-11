import {storageManager} from "../core/storage";

export interface TutorialState {
  completed: boolean;
}

const DEFAULTS: TutorialState = {completed: false};

export const parseTutorialState = (raw: unknown): TutorialState => {
  if (typeof raw !== "object" || raw === null) {
    return DEFAULTS;
  }
  const {completed} = raw as Record<string, unknown>;
  return completed === true ? {completed: true} : DEFAULTS;
};

export const tutorialStore = storageManager.defineStore<TutorialState>({
  key: "tutorial",
  defaults: DEFAULTS,
  parse: parseTutorialState,
});

export const completeTutorial = (): void =>
  tutorialStore.set({completed: true});

export const resetTutorial = (): void => tutorialStore.reset();
