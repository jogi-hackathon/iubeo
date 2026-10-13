import {useSyncExternalStore} from "react";

import {type DeckId, lastStepOf} from "./script";

export type PresentState =
  | {active: false}
  | {active: true; deck: DeckId; step: number; since: number};

/** プレゼンの進行。since は今の手順に入った時刻(performance.now) */
export const createPresentStore = (
  now: () => number = () => performance.now(),
) => {
  let state: PresentState = {active: false};
  const listeners = new Set<() => void>();

  const set = (next: PresentState) => {
    state = next;
    for (const l of Array.from(listeners)) {
      l();
    }
  };

  const goTo = (deck: DeckId, step: number) => {
    set({
      active: true,
      deck,
      step: Math.min(lastStepOf(deck), Math.max(0, step)),
      since: now(),
    });
  };

  return {
    getState: (): PresentState => state,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    start: (deck: DeckId, step = 0) => goTo(deck, step),
    /** 最後の手順(目を開ける)からは進めない。終わりは exit で告げる */
    next: () => {
      if (state.active && state.step < lastStepOf(state.deck)) {
        goTo(state.deck, state.step + 1);
      }
    },
    /** 最後の手順に入ったら戻れない(もう目を開け始めている) */
    prev: () => {
      if (
        state.active &&
        state.step > 0 &&
        state.step < lastStepOf(state.deck)
      ) {
        goTo(state.deck, state.step - 1);
      }
    },
    exit: () => {
      if (state.active) {
        set({active: false});
      }
    },
  };
};

export const presentStore = createPresentStore();

export const usePresent = (): PresentState =>
  useSyncExternalStore(presentStore.subscribe, presentStore.getState);
