import {afterEach, describe, expect, it, vi} from "vitest";

import {
  completeTutorial,
  parseTutorialState,
  resetTutorial,
  tutorialStore,
} from "../tutorialStore";

const TUTORIAL_KEY = "iubeo:tutorial";

const createMemoryLocalStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
};

describe("parseTutorialState", () => {
  it("オブジェクトでなければ未完了を返す", () => {
    expect(parseTutorialState(null)).toEqual({completed: false});
    expect(parseTutorialState("text")).toEqual({completed: false});
    expect(parseTutorialState(1)).toEqual({completed: false});
  });

  it("completed が true 以外なら未完了を返す", () => {
    expect(parseTutorialState({completed: "true"})).toEqual({completed: false});
    expect(parseTutorialState({})).toEqual({completed: false});
  });

  it("completed が true なら完了を返す", () => {
    expect(parseTutorialState({completed: true})).toEqual({completed: true});
  });
});

describe("tutorialStore の配線", () => {
  afterEach(() => {
    tutorialStore.reset();
    vi.unstubAllGlobals();
  });

  it("complete した状態は iubeo:tutorial に JSON で保存され、reset で消えて未完了に戻る", () => {
    const storage = createMemoryLocalStorage();
    vi.stubGlobal("localStorage", storage);

    completeTutorial();
    expect(JSON.parse(storage.map.get(TUTORIAL_KEY) ?? "null")).toEqual({
      completed: true,
    });
    expect(tutorialStore.get().completed).toBe(true);

    resetTutorial();
    expect(storage.map.has(TUTORIAL_KEY)).toBe(false);
    expect(tutorialStore.get().completed).toBe(false);
  });
});
