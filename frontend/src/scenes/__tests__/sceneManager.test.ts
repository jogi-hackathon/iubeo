import {afterEach, describe, expect, it, vi} from "vitest";

import type {SceneName} from "..";
import {
  createSceneManager,
  type SceneManagerOptions,
  type SceneState,
} from "../sceneManager";

// 手動で resolve / reject できる Promise
const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
};

const CORE: SceneName[] = ["room", "sandbox"];
const WITH_TEST: SceneName[] = [...CORE, "test"];

const make = (options: Partial<SceneManagerOptions> = {}) =>
  createSceneManager({initial: "room", available: CORE, ...options});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSceneManager", () => {
  it("初期状態は initial の idle", () => {
    expect(make({initial: "sandbox"}).getState()).toEqual({
      status: "idle",
      current: "sandbox",
    });
  });

  it("goTo で idle -> transitioning -> idle と遷移し、そのたびに subscribe へ通知する", async () => {
    const gate = deferred();
    const m = make({runTransition: () => gate.promise});
    const seen: SceneState[] = [];
    m.subscribe(() => seen.push(m.getState()));

    const p = m.goTo("sandbox");
    expect(m.getState()).toEqual({
      status: "transitioning",
      from: "room",
      to: "sandbox",
    });
    gate.resolve();
    await p;

    expect(m.getState()).toEqual({status: "idle", current: "sandbox"});
    expect(seen).toEqual([
      {status: "transitioning", from: "room", to: "sandbox"},
      {status: "idle", current: "sandbox"},
    ]);
  });

  it("state は変更のたびに新しいオブジェクトになる", async () => {
    const m = make();
    const before = m.getState();
    await m.goTo("sandbox");
    expect(m.getState()).not.toBe(before);
    expect(m.getState()).toBe(m.getState());
  });

  it("transitionStart -> transitionEnd の順に発火し、transitionEnd 時点で idle/to になっている", async () => {
    const m = make();
    const log: string[] = [];
    m.on("transitionStart", (e) => {
      log.push(`start:${e.from}>${e.to}:${m.getState().status}`);
    });
    m.on("transitionEnd", (e) => {
      const s = m.getState();
      log.push(
        `end:${e.from}>${e.to}:${s.status}:${s.status === "idle" ? s.current : "-"}`,
      );
    });

    await m.goTo("sandbox");
    expect(log).toEqual([
      "start:room>sandbox:transitioning",
      "end:room>sandbox:idle:sandbox",
    ]);
  });

  it("runTransition が非同期のあいだは transitionEnd を待つ", async () => {
    const gate = deferred();
    const m = make({runTransition: () => gate.promise});
    const onEnd = vi.fn();
    m.on("transitionEnd", onEnd);

    const p = m.goTo("sandbox");
    await Promise.resolve();
    await Promise.resolve();
    expect(onEnd).not.toHaveBeenCalled();
    expect(m.getState().status).toBe("transitioning");

    gate.resolve();
    await p;
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("runTransition へ from / to を渡す", async () => {
    const runTransition = vi.fn(() => Promise.resolve());
    await make({runTransition}).goTo("sandbox");
    expect(runTransition).toHaveBeenCalledWith({from: "room", to: "sandbox"});
  });

  it("遷移中の goTo は無視する", async () => {
    const gate = deferred();
    const runTransition = vi.fn(() => gate.promise);
    const m = make({available: WITH_TEST, runTransition});
    const onStart = vi.fn();
    m.on("transitionStart", onStart);

    const p = m.goTo("sandbox");
    await m.goTo("test");
    await m.goTo("room");
    expect(m.getState()).toEqual({
      status: "transitioning",
      from: "room",
      to: "sandbox",
    });
    gate.resolve();
    await p;

    expect(m.getState()).toEqual({status: "idle", current: "sandbox"});
    expect(runTransition).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("現在と同じシーンへの goTo は無視する", async () => {
    const m = make();
    const listener = vi.fn();
    const onStart = vi.fn();
    m.subscribe(listener);
    m.on("transitionStart", onStart);

    await m.goTo("room");
    expect(listener).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(m.getState()).toEqual({status: "idle", current: "room"});
  });

  it("available に無いシーンへは遷移できない", async () => {
    const m = make({available: CORE});
    const onStart = vi.fn();
    m.on("transitionStart", onStart);

    await m.goTo("test");
    expect(m.getState()).toEqual({status: "idle", current: "room"});
    expect(onStart).not.toHaveBeenCalled();
  });

  it("available にあれば test へ遷移できる", async () => {
    const m = make({available: WITH_TEST});
    await m.goTo("test");
    expect(m.getState()).toEqual({status: "idle", current: "test"});
  });

  it("initial が available に無ければ生成時にエラー", () => {
    expect(() =>
      createSceneManager({initial: "test", available: CORE}),
    ).toThrow();
    expect(() =>
      createSceneManager({initial: "test", available: WITH_TEST}),
    ).not.toThrow();
  });

  it("on / subscribe の解除関数で通知が止まる", async () => {
    const m = make();
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const listener = vi.fn();
    const offStart = m.on("transitionStart", onStart);
    m.on("transitionEnd", onEnd);
    const unsubscribe = m.subscribe(listener);

    offStart();
    unsubscribe();
    await m.goTo("sandbox");
    expect(onStart).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("コールバックが例外を投げても他のコールバック・状態更新に影響しない", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = make();
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const listener = vi.fn();
    m.on("transitionStart", () => {
      throw new Error("start");
    });
    m.on("transitionStart", onStart);
    m.on("transitionEnd", () => {
      throw new Error("end");
    });
    m.on("transitionEnd", onEnd);
    m.subscribe(() => {
      throw new Error("listener");
    });
    m.subscribe(listener);

    await m.goTo("sandbox");
    expect(m.getState()).toEqual({status: "idle", current: "sandbox"});
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(4);
  });

  it("runTransition が reject したら from へ戻り、transitionEnd は発火せず goTo は resolve する", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = make({runTransition: () => Promise.reject(new Error("boom"))});
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const seen: SceneState[] = [];
    m.on("transitionStart", onStart);
    m.on("transitionEnd", onEnd);
    m.subscribe(() => seen.push(m.getState()));

    await expect(m.goTo("sandbox")).resolves.toBeUndefined();
    expect(m.getState()).toEqual({status: "idle", current: "room"});
    expect(seen).toEqual([
      {status: "transitioning", from: "room", to: "sandbox"},
      {status: "idle", current: "room"},
    ]);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("通知中に追加されたコールバックは、今回のイベントでは呼ばれない", async () => {
    const m = make();
    const late = vi.fn();
    m.on("transitionEnd", () => {
      m.on("transitionEnd", late);
    });
    await m.goTo("sandbox");
    expect(late).not.toHaveBeenCalled();
    await m.goTo("room");
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("transitionEnd 内から goTo しても、全ハンドラに元の {from, to} が渡る", async () => {
    const m = make();
    const seen: string[] = [];
    m.on("transitionEnd", ({from, to}) => {
      seen.push(`h1 ${from}>${to}`);
      void m.goTo("room");
    });
    m.on("transitionEnd", ({from, to}) => {
      seen.push(`h2 ${from}>${to}`);
    });
    await m.goTo("sandbox");
    // ハンドラは getState() ではなくペイロードを見る(契約)。h1 の goTo による2回目の遷移は別イベント
    expect(seen.slice(0, 2)).toEqual(["h1 room>sandbox", "h2 room>sandbox"]);
    expect(seen.slice(2)).toEqual(["h1 sandbox>room", "h2 sandbox>room"]);
  });

  it("遷移完了後は再び goTo できる", async () => {
    const m = make();
    await m.goTo("sandbox");
    await m.goTo("room");
    expect(m.getState()).toEqual({status: "idle", current: "room"});
  });
});
