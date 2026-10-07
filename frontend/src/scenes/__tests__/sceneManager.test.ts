import {afterEach, describe, expect, it, vi} from "vitest";

import type {SceneName} from "..";
import {createSceneManager, type SceneState} from "../sceneManager";

const CORE: SceneName[] = ["room", "sandbox"];
const WITH_TEST: SceneName[] = [...CORE, "test"];

const make = (initial: SceneName = "room", available = CORE) =>
  createSceneManager({initial, available});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSceneManager", () => {
  it("初期状態は initial", () => {
    expect(make("sandbox").getState()).toEqual({current: "sandbox"});
  });

  it("commit で current が変わり、subscribe へ通知する", () => {
    const m = make();
    const seen: SceneState[] = [];
    m.subscribe(() => seen.push(m.getState()));

    m.commit("sandbox");

    expect(m.getState()).toEqual({current: "sandbox"});
    expect(seen).toEqual([{current: "sandbox"}]);
  });

  it("state は変更のたびに新しいオブジェクトになる", () => {
    const m = make();
    const before = m.getState();
    m.commit("sandbox");
    expect(m.getState()).not.toBe(before);
    expect(before).toEqual({current: "room"});
    expect(m.getState()).toBe(m.getState());
  });

  it("現在と同じシーンへの commit は無視する(state も通知も変わらない)", () => {
    const m = make();
    const listener = vi.fn();
    m.subscribe(listener);
    const before = m.getState();

    m.commit("room");

    expect(listener).not.toHaveBeenCalled();
    expect(m.getState()).toBe(before);
  });

  it("available に無いシーンへの commit は無視する", () => {
    const m = make("room", CORE);
    const listener = vi.fn();
    m.subscribe(listener);

    m.commit("test");

    expect(m.getState()).toEqual({current: "room"});
    expect(listener).not.toHaveBeenCalled();
  });

  it("available にあれば test へ commit できる", () => {
    const m = make("room", WITH_TEST);
    m.commit("test");
    expect(m.getState()).toEqual({current: "test"});
  });

  it("isAvailable は available にあるシーンだけ true", () => {
    const m = make("room", CORE);
    expect(m.isAvailable("sandbox")).toBe(true);
    expect(m.isAvailable("test")).toBe(false);
  });

  it("initial が available に無ければ生成時にエラー", () => {
    expect(() => make("test", CORE)).toThrow();
    expect(() => make("test", WITH_TEST)).not.toThrow();
  });

  it("subscribe の解除関数で通知が止まる", () => {
    const m = make();
    const listener = vi.fn();
    const unsubscribe = m.subscribe(listener);

    unsubscribe();
    m.commit("sandbox");

    expect(listener).not.toHaveBeenCalled();
  });

  it("リスナーが例外を投げても、他のリスナー・状態更新に影響しない", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = make();
    const listener = vi.fn();
    m.subscribe(() => {
      throw new Error("listener");
    });
    m.subscribe(listener);

    m.commit("sandbox");

    expect(m.getState()).toEqual({current: "sandbox"});
    expect(listener).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
