import {describe, expect, it, vi} from "vitest";

import {createStorageManager} from "../../core/storage";
import {createTutorialManager, type TutorialStep} from "../tutorialManager";
import {TUTORIAL_STEPS, type TutorialEvent} from "../tutorialSteps";
import {parseTutorialState, type TutorialState} from "../tutorialStore";

type Ev = "a" | "b" | "c";

const on = (id: string, event: Ev): TutorialStep<Ev> => ({
  id,
  advanceOn: (e) => e === event,
});

const STEPS = [on("s1", "a"), on("s2", "b"), on("s3", "c")];

const createStore = (completed: boolean) => {
  const map = new Map<string, string>();
  if (completed) {
    map.set("iubeo:tutorial", JSON.stringify({completed: true}));
  }
  return createStorageManager({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  }).defineStore<TutorialState>({
    key: "tutorial",
    defaults: {completed: false},
    parse: parseTutorialState,
  });
};

const setup = ({
  completed = false,
  steps = STEPS,
}: {completed?: boolean; steps?: readonly TutorialStep<Ev>[]} = {}) => {
  const store = createStore(completed);
  const onComplete = vi.fn();
  const manager = createTutorialManager<Ev>({steps, store, onComplete});
  return {manager, store, onComplete};
};

describe("createTutorialManager", () => {
  it("開始前は idle", () => {
    expect(setup().manager.getState()).toEqual({status: "idle"});
  });

  it("start で最初のステップに入る", () => {
    const {manager} = setup();
    manager.start();
    expect(manager.getState()).toEqual({
      status: "running",
      stepIndex: 0,
      step: STEPS[0],
    });
  });

  it("現在のステップの条件に合うイベントだけで進み、最後を越えると完了して保存する", () => {
    const {manager, store, onComplete} = setup();
    manager.start();
    manager.signal("b");
    expect(manager.getState()).toMatchObject({status: "running", stepIndex: 0});

    manager.signal("a");
    expect(manager.getState()).toMatchObject({status: "running", stepIndex: 1});
    manager.signal("b");
    expect(manager.getState()).toMatchObject({status: "running", stepIndex: 2});
    expect(store.getState().completed).toBe(false);

    manager.signal("c");
    expect(manager.getState()).toEqual({status: "completed"});
    expect(store.getState().completed).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("1 つのイベントで進むのは 1 ステップだけ", () => {
    const {manager} = setup({steps: [on("s1", "a"), on("s2", "a")]});
    manager.start();
    manager.signal("a");
    expect(manager.getState()).toMatchObject({status: "running", stepIndex: 1});
  });

  it("完了済みなら start してもステップに入らず completed になる", () => {
    const {manager, onComplete} = setup({completed: true});
    manager.start();
    expect(manager.getState()).toEqual({status: "completed"});
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("running 中の start は無視する", () => {
    const {manager} = setup();
    manager.start();
    manager.signal("a");
    manager.start();
    expect(manager.getState()).toMatchObject({status: "running", stepIndex: 1});
  });

  it("idle・completed では signal は何もしない", () => {
    const {manager} = setup();
    manager.signal("a");
    expect(manager.getState()).toEqual({status: "idle"});
    manager.start();
    manager.complete();
    manager.signal("a");
    expect(manager.getState()).toEqual({status: "completed"});
  });

  it("途中でも complete で完了でき、2 回目は onComplete を呼ばない", () => {
    const {manager, store, onComplete} = setup();
    manager.start();
    manager.complete();
    manager.complete();
    expect(manager.getState()).toEqual({status: "completed"});
    expect(store.getState().completed).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("ステップが空なら start で完了する", () => {
    const {manager, store} = setup({steps: []});
    manager.start();
    expect(manager.getState()).toEqual({status: "completed"});
    expect(store.getState().completed).toBe(true);
  });

  it("reset で未完了の idle に戻り、再度 start できる", () => {
    const {manager, store} = setup();
    manager.start();
    manager.complete();
    manager.reset();
    expect(manager.getState()).toEqual({status: "idle"});
    expect(store.getState().completed).toBe(false);
    manager.start();
    expect(manager.getState()).toMatchObject({status: "running", stepIndex: 0});
  });

  it("abort で、完了を保存せずに実行中だけ idle に戻す", () => {
    const {manager, store} = setup();
    manager.start();
    manager.signal("a");
    manager.abort();
    expect(manager.getState()).toEqual({status: "idle"});
    expect(store.getState().completed).toBe(false);
    manager.start();
    expect(manager.getState()).toMatchObject({status: "running", stepIndex: 0});

    manager.complete();
    manager.abort();
    expect(manager.getState()).toEqual({status: "completed"});
  });

  it("状態が変わるたび購読者に通知し、解除後は通知しない", () => {
    const {manager} = setup();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);
    manager.start();
    manager.signal("a");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    manager.signal("b");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("onComplete が throw しても完了は壊れない", () => {
    const manager = createTutorialManager<Ev>({
      steps: STEPS,
      store: createStore(false),
      onComplete: () => {
        throw new Error("boom");
      },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    manager.start();
    manager.complete();
    expect(manager.getState()).toEqual({status: "completed"});
    spy.mockRestore();
  });
});

describe("TUTORIAL_STEPS", () => {
  const run = (events: TutorialEvent[]) => {
    const manager = createTutorialManager<TutorialEvent>({
      steps: TUTORIAL_STEPS,
      store: createStore(false),
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
