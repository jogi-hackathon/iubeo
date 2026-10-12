import {describe, expect, it} from "vitest";

import {createTutorialManager, type TutorialState} from "../../../../tutorial";
import {TUTORIAL_STEPS, type TutorialEvent} from "../steps";

describe("TUTORIAL_STEPS", () => {
  const run = (events: TutorialEvent[]) => {
    let state: TutorialState = {completed: false};
    const manager = createTutorialManager<TutorialEvent>({
      steps: TUTORIAL_STEPS,
      store: {
        getState: () => state,
        set: (next) => {
          state = next;
        },
        reset: () => {
          state = {completed: false};
        },
      },
    });
    manager.start();
    for (const e of events) {
      manager.signal(e);
    }
    return manager.getState();
  };
  it("想定どおりの操作の順で最後まで進んで完了する", () => {
    const state = run([
      {type: "zone", zone: "chair"},
      {type: "held", file: "file_created"},
      {type: "held", file: null},
      {type: "held", file: "unedited"},
      {type: "held", file: "edited"},
      {type: "held", file: null},
      {type: "held", file: "image_created"},
      {type: "held", file: null},
      {type: "zone", zone: "pcFront"},
    ]);
    expect(state).toEqual({status: "completed"});
  });

  it("順番を飛ばした操作では進まない", () => {
    const state = run([
      {type: "zone", zone: "pcFront"},
      {type: "held", file: "image_created"},
      {type: "zone", zone: "chair"},
      {type: "held", file: "edited"},
    ]);
    expect(state).toMatchObject({
      status: "running",
      stepIndex: 1,
      step: {id: "workspaceCreate"},
    });
  });
});
