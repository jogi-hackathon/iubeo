import type {StorageStore} from "../core/storage";
import type {TutorialState} from "./tutorialStore";

export type TutorialStep<E> = {
  id: string;
  advanceOn: (event: E) => boolean;
};

export type TutorialFlowState<E> =
  | {status: "idle"}
  | {status: "running"; stepIndex: number; step: TutorialStep<E>}
  | {status: "completed"};

export type TutorialManagerOptions<E> = {
  steps: readonly TutorialStep<E>[];
  store: Pick<StorageStore<TutorialState>, "getState" | "set" | "reset">;
  onComplete?: () => void;
};

export const createTutorialManager = <E>({
  steps,
  store,
  onComplete,
}: TutorialManagerOptions<E>) => {
  let state: TutorialFlowState<E> = {status: "idle"};
  const listeners = new Set<() => void>();

  const set = (next: TutorialFlowState<E>) => {
    state = next;
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const runStep = (stepIndex: number) => {
    const step = steps[stepIndex];
    if (step === undefined) {
      complete();
      return;
    }
    set({status: "running", stepIndex, step});
  };

  const complete = () => {
    if (state.status === "completed") {
      return;
    }
    store.set({completed: true});
    set({status: "completed"});
    try {
      onComplete?.();
    } catch (e) {
      console.error(e);
    }
  };

  return {
    getState: (): TutorialFlowState<E> => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start: () => {
      if (state.status !== "idle") {
        return;
      }
      if (store.getState().completed) {
        set({status: "completed"});
        return;
      }
      runStep(0);
    },
    signal: (event: E) => {
      if (state.status === "running" && state.step.advanceOn(event)) {
        runStep(state.stepIndex + 1);
      }
    },
    complete,
    abort: () => {
      if (state.status === "running") {
        set({status: "idle"});
      }
    },
    reset: () => {
      store.reset();
      set({status: "idle"});
    },
  };
};

export type TutorialManager<E> = ReturnType<typeof createTutorialManager<E>>;
