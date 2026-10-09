import {afterEach, describe, expect, it, vi} from "vitest";

import type {SceneName} from "..";
import {createSceneManager} from "../sceneManager";
import {
  createSceneTransitionManager,
  type SceneTransitionManagerOptions,
  type TransitionState,
} from "../sceneTransitionManager";

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

const make = (
  options: Partial<Omit<SceneTransitionManagerOptions, "sceneManager">> & {
    available?: SceneName[];
  } = {},
) => {
  const {available = CORE, ...rest} = options;
  const scenes = createSceneManager({initial: "room", available});
  const m = createSceneTransitionManager({sceneManager: scenes, ...rest});
  return {scenes, m};
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSceneTransitionManager", () => {
  it("canStart が false の間(起動の覆いの間など)は、goTo しても遷移を始めない", async () => {
    let allowed = false;
    const runTransition = vi.fn(() => Promise.resolve());
    const {scenes, m} = make({runTransition, canStart: () => allowed});

    await m.goTo("sandbox");
    expect(runTransition).not.toHaveBeenCalled();
    expect(m.getState()).toEqual({status: "idle"});
    expect(scenes.getState().current).toBe("room");

    allowed = true;
    await m.goTo("sandbox");
    expect(scenes.getState().current).toBe("sandbox");
  });

  it("初期状態は idle", () => {
    expect(make().m.getState()).toEqual({status: "idle"});
  });

  it("goTo で idle -> transitioning -> idle と遷移し、そのたびに subscribe へ通知する。current は commit で変わる", async () => {
    const gate = deferred();
    const {scenes, m} = make({runTransition: () => gate.promise});
    const seen: TransitionState[] = [];
    m.subscribe(() => seen.push(m.getState()));

    const p = m.goTo("sandbox");
    expect(m.getState()).toEqual({
      status: "transitioning",
      from: "room",
      to: "sandbox",
    });
    // 演出中は commit 前なので、今のシーンは from のまま
    expect(scenes.getState()).toEqual({current: "room"});
    gate.resolve();
    await p;

    expect(m.getState()).toEqual({status: "idle"});
    expect(scenes.getState()).toEqual({current: "sandbox"});
    expect(seen).toEqual([
      {status: "transitioning", from: "room", to: "sandbox"},
      {status: "idle"},
    ]);
  });

  it("state は変更のたびに新しいオブジェクトになる", async () => {
    const {m} = make();
    const before = m.getState();
    await m.goTo("sandbox");
    expect(m.getState()).not.toBe(before);
    expect(m.getState()).toBe(m.getState());
  });

  it("transitionStart -> transitionEnd の順に発火し、transitionEnd 時点で idle・current は to になっている", async () => {
    const {scenes, m} = make();
    const log: string[] = [];
    m.on("transitionStart", (e) => {
      log.push(
        `start:${e.from}>${e.to}:${m.getState().status}:${scenes.getState().current}`,
      );
    });
    m.on("transitionEnd", (e) => {
      log.push(
        `end:${e.from}>${e.to}:${m.getState().status}:${scenes.getState().current}`,
      );
    });

    await m.goTo("sandbox");
    expect(log).toEqual([
      "start:room>sandbox:transitioning:room",
      "end:room>sandbox:idle:sandbox",
    ]);
  });

  it("フックの順序は onLeave -> runTransition -> onPrepare -> commit -> onEnter -> transitionEnd", async () => {
    const log: string[] = [];
    const {scenes, m} = make({
      runTransition: () => {
        log.push("runTransition");
        return Promise.resolve();
      },
    });
    const current = () => scenes.getState().current;
    m.on("transitionStart", () => log.push("transitionStart"));
    m.onLeave(({from, to}) => log.push(`leave:${from}>${to}:${current()}`));
    m.onPrepare(({from, to}) => log.push(`prepare:${from}>${to}:${current()}`));
    scenes.subscribe(() => log.push(`commit:${current()}`));
    m.onEnter(({from, to}) => log.push(`enter:${from}>${to}:${current()}`));
    m.on("transitionEnd", () => log.push("transitionEnd"));

    await m.goTo("sandbox");

    expect(log).toEqual([
      "transitionStart",
      "leave:room>sandbox:room",
      "runTransition",
      "prepare:room>sandbox:room",
      "commit:sandbox",
      "enter:room>sandbox:sandbox",
      "transitionEnd",
    ]);
  });

  it("onPrepare から commit までは同じ同期区間(間に await を挟まない)", async () => {
    const {scenes, m} = make();
    const log: string[] = [];
    m.onPrepare(() => {
      log.push("prepare");
      void Promise.resolve().then(() => log.push("microtask"));
    });
    scenes.subscribe(() => log.push("commit"));
    m.onEnter(() => log.push("enter"));

    await m.goTo("sandbox");

    expect(log.slice(0, 3)).toEqual(["prepare", "commit", "enter"]);
  });

  it("runTransition が非同期のあいだは、onPrepare・commit・transitionEnd を待つ", async () => {
    const gate = deferred();
    const {scenes, m} = make({runTransition: () => gate.promise});
    const onLeave = vi.fn();
    const onPrepare = vi.fn();
    const onEnd = vi.fn();
    m.onLeave(onLeave);
    m.onPrepare(onPrepare);
    m.on("transitionEnd", onEnd);

    const p = m.goTo("sandbox");
    await Promise.resolve();
    await Promise.resolve();
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onPrepare).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(scenes.getState()).toEqual({current: "room"});
    expect(m.getState().status).toBe("transitioning");

    gate.resolve();
    await p;
    expect(onPrepare).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("runTransition へ from / to を渡す", async () => {
    const runTransition = vi.fn(() => Promise.resolve());
    await make({runTransition}).m.goTo("sandbox");
    expect(runTransition).toHaveBeenCalledWith({from: "room", to: "sandbox"});
  });

  it("遷移中の goTo は無視する", async () => {
    const gate = deferred();
    const runTransition = vi.fn(() => gate.promise);
    const {scenes, m} = make({available: WITH_TEST, runTransition});
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

    expect(scenes.getState()).toEqual({current: "sandbox"});
    expect(m.getState()).toEqual({status: "idle"});
    expect(runTransition).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("現在と同じシーンへの goTo は無視する", async () => {
    const {m} = make();
    const listener = vi.fn();
    const onStart = vi.fn();
    const onLeave = vi.fn();
    m.subscribe(listener);
    m.on("transitionStart", onStart);
    m.onLeave(onLeave);

    await m.goTo("room");
    expect(listener).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
    expect(m.getState()).toEqual({status: "idle"});
  });

  it("available に無いシーンへは遷移できない", async () => {
    const {scenes, m} = make({available: CORE});
    const onStart = vi.fn();
    const onLeave = vi.fn();
    m.on("transitionStart", onStart);
    m.onLeave(onLeave);

    await m.goTo("test");
    expect(scenes.getState()).toEqual({current: "room"});
    expect(m.getState()).toEqual({status: "idle"});
    expect(onStart).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("available にあれば test へ遷移できる", async () => {
    const {scenes, m} = make({available: WITH_TEST});
    await m.goTo("test");
    expect(scenes.getState()).toEqual({current: "test"});
  });

  it("on / onLeave / onPrepare / onEnter / subscribe の解除関数で通知が止まる", async () => {
    const {m} = make();
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const onLeave = vi.fn();
    const onPrepare = vi.fn();
    const onEnter = vi.fn();
    const listener = vi.fn();
    const offs = [
      m.on("transitionStart", onStart),
      m.onLeave(onLeave),
      m.onPrepare(onPrepare),
      m.onEnter(onEnter),
      m.subscribe(listener),
    ];
    m.on("transitionEnd", onEnd);

    for (const off of offs) {
      off();
    }
    await m.goTo("sandbox");

    expect(onStart).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
    expect(onPrepare).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("コールバック・フックが例外を投げても、他のコールバック・状態更新に影響しない", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const {scenes, m} = make();
    const boom = (name: string) => () => {
      throw new Error(name);
    };
    const onStart = vi.fn();
    const onLeave = vi.fn();
    const onPrepare = vi.fn();
    const onEnter = vi.fn();
    const onEnd = vi.fn();
    const listener = vi.fn();
    m.on("transitionStart", boom("start"));
    m.on("transitionStart", onStart);
    m.onLeave(boom("leave"));
    m.onLeave(onLeave);
    m.onPrepare(boom("prepare"));
    m.onPrepare(onPrepare);
    m.onEnter(boom("enter"));
    m.onEnter(onEnter);
    m.on("transitionEnd", boom("end"));
    m.on("transitionEnd", onEnd);
    m.subscribe(boom("listener"));
    m.subscribe(listener);

    await m.goTo("sandbox");

    expect(scenes.getState()).toEqual({current: "sandbox"});
    expect(m.getState()).toEqual({status: "idle"});
    for (const fn of [onStart, onLeave, onPrepare, onEnter, onEnd]) {
      expect(fn).toHaveBeenCalledTimes(1);
    }
    expect(listener).toHaveBeenCalledTimes(2);
    // 例外を投げた 5 つのコールバック・フックと、リスナー 2 回
    expect(error).toHaveBeenCalledTimes(7);
  });

  it("runTransition が reject したら from のまま idle に戻り、commit・onPrepare・onEnter・transitionEnd はせず goTo は resolve する", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const {scenes, m} = make({
      runTransition: () => Promise.reject(new Error("boom")),
    });
    const onStart = vi.fn();
    const onLeave = vi.fn();
    const onPrepare = vi.fn();
    const onEnter = vi.fn();
    const onEnd = vi.fn();
    const commit = vi.fn();
    const seen: TransitionState[] = [];
    m.on("transitionStart", onStart);
    m.onLeave(onLeave);
    m.onPrepare(onPrepare);
    m.onEnter(onEnter);
    m.on("transitionEnd", onEnd);
    scenes.subscribe(commit);
    m.subscribe(() => seen.push(m.getState()));

    await expect(m.goTo("sandbox")).resolves.toBeUndefined();
    expect(scenes.getState()).toEqual({current: "room"});
    expect(m.getState()).toEqual({status: "idle"});
    expect(seen).toEqual([
      {status: "transitioning", from: "room", to: "sandbox"},
      {status: "idle"},
    ]);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onPrepare).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("通知中に追加されたコールバック・フックは、今回は呼ばれない", async () => {
    const {m} = make();
    const late = vi.fn();
    const lateHook = vi.fn();
    m.on("transitionEnd", () => {
      m.on("transitionEnd", late);
    });
    m.onEnter(() => {
      m.onEnter(lateHook);
    });
    await m.goTo("sandbox");
    expect(late).not.toHaveBeenCalled();
    expect(lateHook).not.toHaveBeenCalled();
    await m.goTo("room");
    expect(late).toHaveBeenCalledTimes(1);
    expect(lateHook).toHaveBeenCalledTimes(1);
  });

  it("transitionEnd 内から goTo しても、全ハンドラに元の {from, to} が渡る", async () => {
    const {m} = make();
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
    // (準備の待ちが入るので、2回目の遷移の完了は外側の goTo より後になる)
    await vi.waitFor(() => expect(seen).toHaveLength(4));
    expect(seen.slice(0, 2)).toEqual(["h1 room>sandbox", "h2 room>sandbox"]);
    expect(seen.slice(2)).toEqual(["h1 sandbox>room", "h2 sandbox>room"]);
  });

  it("commit のあと、waitReady が resolve してから finishTransition・transitionEnd の順に進む", async () => {
    const ready = deferred();
    const log: string[] = [];
    const {scenes, m} = make({
      runTransition: () => {
        log.push("cover");
        return Promise.resolve();
      },
      waitReady: (scene) => {
        log.push(`wait:${scene}:${scenes.getState().current}`);
        return ready.promise;
      },
      finishTransition: () => log.push("uncover"),
    });
    m.on("transitionEnd", () => log.push("transitionEnd"));
    scenes.subscribe(() => log.push(`commit:${scenes.getState().current}`));

    const p = m.goTo("sandbox");
    await vi.waitFor(() => expect(log).toContain("wait:sandbox:sandbox"));
    expect(log).toEqual(["cover", "commit:sandbox", "wait:sandbox:sandbox"]);
    expect(m.getState().status).toBe("transitioning");

    ready.resolve();
    await p;
    expect(log).toEqual([
      "cover",
      "commit:sandbox",
      "wait:sandbox:sandbox",
      "uncover",
      "transitionEnd",
    ]);
    expect(m.getState()).toEqual({status: "idle"});
  });

  it("準備が終わらなければ、覆いを外さず transitioning のまま", async () => {
    const finishTransition = vi.fn();
    const onEnd = vi.fn();
    const {m} = make({
      waitReady: () => new Promise<void>(() => {}),
      finishTransition,
    });
    m.on("transitionEnd", onEnd);

    void m.goTo("sandbox");
    await new Promise((r) => setTimeout(r, 0));
    expect(finishTransition).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(m.getState().status).toBe("transitioning");
  });

  it("waitReady が reject しても、commit 済みなので遷移は完了し finishTransition は呼ぶ", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const finishTransition = vi.fn();
    const {scenes, m} = make({
      waitReady: () => Promise.reject(new Error("wait")),
      finishTransition,
    });

    await m.goTo("sandbox");
    expect(scenes.getState()).toEqual({current: "sandbox"});
    expect(finishTransition).toHaveBeenCalledTimes(1);
    expect(m.getState()).toEqual({status: "idle"});
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("waitReady へ to を渡す(from ではない)", async () => {
    const waitReady = vi.fn(() => Promise.resolve());
    await make({waitReady}).m.goTo("sandbox");
    expect(waitReady).toHaveBeenCalledWith("sandbox");
  });

  it("遷移完了後は再び goTo できる", async () => {
    const {scenes, m} = make();
    await m.goTo("sandbox");
    await m.goTo("room");
    expect(scenes.getState()).toEqual({current: "room"});
    expect(m.getState()).toEqual({status: "idle"});
  });
});
