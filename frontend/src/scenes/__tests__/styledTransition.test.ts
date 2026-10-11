import {describe, expect, it, vi} from "vitest";

import {createSceneManager} from "../sceneManager";
import {createSceneTransitionManager} from "../sceneTransitionManager";
import {
  createStyledTransition,
  type DiveTransitionStyle,
  type TransitionStyle,
} from "../styledTransition";

const makeCover = (): TransitionStyle => ({
  run: vi.fn(() => Promise.resolve()),
  waitReady: vi.fn(() => Promise.resolve()),
  finish: vi.fn(),
});

const makeDive = (
  overrides: Partial<DiveTransitionStyle> = {},
): DiveTransitionStyle => ({
  canRun: () => true,
  run: vi.fn(() => Promise.resolve()),
  waitReady: vi.fn(() => Promise.resolve()),
  finish: vi.fn(),
  ...overrides,
});

const setup = () => {
  const coverStyle = makeCover();
  const release = vi.fn();
  const locked = {value: false};
  const setActive = vi.fn();
  const styled = createStyledTransition({
    coverStyle,
    lockControl: () => {
      locked.value = true;
      return () => {
        locked.value = false;
        release();
      };
    },
    onTransitionStart: () => {},
    setActive,
  });
  const scenes = createSceneManager({
    initial: "room",
    available: ["room", "sandbox"],
  });
  const m = createSceneTransitionManager({
    sceneManager: scenes,
    ...styled.hooks,
  });
  styled.bind(m);
  return {coverStyle, styled, m, locked, setActive};
};

describe("createStyledTransition", () => {
  it("canRun が false なら cover を使う", async () => {
    const {coverStyle, styled, m} = setup();
    const dive = makeDive({canRun: () => false});
    styled.setDiveStyle(dive);
    await m.goTo("sandbox");
    expect(coverStyle.run).toHaveBeenCalledTimes(1);
    expect(dive.run).not.toHaveBeenCalled();
  });

  it("canRun が throw したら cover を使う", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const {coverStyle, styled, m} = setup();
    const dive = makeDive({
      canRun: () => {
        throw new Error("boom");
      },
    });
    styled.setDiveStyle(dive);
    await m.goTo("sandbox");
    expect(coverStyle.run).toHaveBeenCalledTimes(1);
    expect(dive.run).not.toHaveBeenCalled();
  });

  it("canRun が true なら dive を使う", async () => {
    const {coverStyle, styled, m} = setup();
    const dive = makeDive();
    styled.setDiveStyle(dive);
    await m.goTo("sandbox");
    expect(dive.run).toHaveBeenCalledTimes(1);
    expect(coverStyle.run).not.toHaveBeenCalled();
  });

  it("run が reject したら操作の預かりが戻る", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const {styled, m, locked} = setup();
    styled.setDiveStyle(
      makeDive({run: () => Promise.reject(new Error("fail"))}),
    );
    await m.goTo("sandbox").catch(() => {});
    expect(locked.value).toBe(false);
  });

  it("遷移中は transitionActive が true で、idle に戻ると false", async () => {
    const {m, setActive, locked} = setup();
    await m.goTo("sandbox");
    expect(setActive).toHaveBeenCalledWith(true);
    expect(setActive).toHaveBeenLastCalledWith(false);
    expect(m.getState().status).toBe("idle");
    expect(locked.value).toBe(false);
  });
});
