import {describe, expect, it, vi} from "vitest";

import type {GameFlowState} from "../../../../../flow";
import type {AppView} from "../../kernel/app";
import type {Rect} from "../../kernel/geometry";
import {
  createMatchmakingApp,
  MATCHMAKING_LAYOUT,
  matchmakingLines,
} from "../matchmaking";
import {createSettingsApp, SETTINGS_LAYOUT} from "../settings";

const clickAt = (view: AppView, r: Rect) => {
  const x = r.x + r.width / 2;
  const y = r.y + r.height / 2;
  view.pointer?.({type: "down", x, y, button: 0});
  view.pointer?.({type: "up", x, y, button: 0});
};

const fakeFlow = (initial: GameFlowState = {status: "idle"}) => {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    startMatchmaking: vi.fn(),
    cancelMatchmaking: vi.fn(),
    set: (next: GameFlowState) => {
      state = next;
      for (const l of Array.from(listeners)) {
        l();
      }
    },
    listeners,
  };
};

const fakeSchedule = () => {
  const running = new Set<() => void>();
  const schedule = vi.fn((fn: () => void) => {
    running.add(fn);
    return () => {
      running.delete(fn);
    };
  });
  return {schedule, running, tick: () => running.forEach((fn) => fn())};
};

describe("接続(マッチング)のアプリ", () => {
  const open = (initial?: GameFlowState) => {
    const flow = fakeFlow(initial);
    const timers = fakeSchedule();
    const app = createMatchmakingApp({
      flow,
      now: () => 10_000,
      schedule: timers.schedule,
    });
    const view = app.open({close: () => {}});
    return {flow, timers, view};
  };

  it("待っているときのボタンは開始を、探している間はキャンセルを伝える", () => {
    const {flow, view} = open();
    clickAt(view, MATCHMAKING_LAYOUT.button);
    expect(flow.startMatchmaking).toHaveBeenCalledTimes(1);

    flow.set({status: "queued", playerId: "p"});
    clickAt(view, MATCHMAKING_LAYOUT.button);
    expect(flow.cancelMatchmaking).toHaveBeenCalledTimes(1);

    flow.set({status: "error", message: "x"});
    clickAt(view, MATCHMAKING_LAYOUT.button);
    expect(flow.startMatchmaking).toHaveBeenCalledTimes(2);
  });

  it("見つかったあとはボタンを押せない", () => {
    const {flow, view} = open({
      status: "matched",
      playerId: "p",
      sessionId: "s",
    });
    clickAt(view, MATCHMAKING_LAYOUT.button);
    expect(flow.startMatchmaking).not.toHaveBeenCalled();
    expect(flow.cancelMatchmaking).not.toHaveBeenCalled();
  });

  it("接続中・探している間・見つかった直後だけ、時を刻んで描き直させる", () => {
    const {flow, timers, view} = open();
    const listener = vi.fn();
    view.subscribe?.(listener);
    expect(timers.running.size).toBe(0);

    flow.set({status: "issuing"});
    expect(timers.running.size).toBe(1);
    flow.set({status: "queued", playerId: "p"});
    expect(timers.schedule).toHaveBeenCalledTimes(1);
    listener.mockClear();
    timers.tick();
    expect(listener).toHaveBeenCalledTimes(1);

    flow.set({status: "idle"});
    expect(timers.running.size).toBe(0);
  });

  it("試合に入ったら時を刻むのをやめる(窓を開いたまま試合へ行っても描き直させ続けない)", () => {
    const {flow, timers} = open({
      status: "matched",
      playerId: "p",
      sessionId: "s",
    });
    expect(timers.running.size).toBe(1);
    flow.set({status: "inSession", playerId: "p", sessionId: "s"});
    expect(timers.running.size).toBe(0);
  });

  it("押したまま離れても、戻ってから空いた所を押しただけでは何も起きない", () => {
    const {flow, view} = open();
    const r = MATCHMAKING_LAYOUT.button;
    view.pointer?.({type: "down", x: r.x + 5, y: r.y + 5, button: 0});
    view.cancel?.();
    view.pointer?.({type: "down", x: 5, y: 5, button: 0});
    view.pointer?.({type: "up", x: r.x + 5, y: r.y + 5, button: 0});
    expect(flow.startMatchmaking).not.toHaveBeenCalled();
  });

  it("閉じたら流れの購読と時刻みを止める", () => {
    const {flow, timers, view} = open({status: "queued", playerId: "p"});
    expect(flow.listeners.size).toBe(1);
    view.dispose?.();
    expect(flow.listeners.size).toBe(0);
    expect(timers.running.size).toBe(0);
  });

  it("文: 通知があれば通知を、探している間は待ち時間を、エラーは中身を補足に出す", () => {
    expect(
      matchmakingLines({status: "idle", notice: "dissolved"}, null)[0],
    ).toBe("人数がそろわず、セッションは解散しました");
    expect(matchmakingLines({status: "queued", playerId: "p"}, 65_000)).toEqual(
      ["接続を待っています…", "待機時間 1:05"],
    );
    expect(matchmakingLines({status: "error", message: "502"}, null)).toEqual([
      "うまくいきませんでした。「待機」でやり直せます。",
      "502",
    ]);
  });
});

describe("設定のアプリ", () => {
  const open = (initial = 1) => {
    let state = {sensitivity: initial};
    const listeners = new Set<() => void>();
    const mouse = {
      getState: () => state,
      set: vi.fn((next: {sensitivity: number}) => {
        state = next;
        for (const l of Array.from(listeners)) {
          l();
        }
      }),
      subscribe: (l: () => void) => {
        listeners.add(l);
        return () => {
          listeners.delete(l);
        };
      },
    };
    const close = vi.fn();
    const view = createSettingsApp({mouse}).open({close});
    return {mouse, close, view, get: () => state.sensitivity, listeners};
  };

  it("スライダーを動かすと、すぐ感度を保存する(端は範囲の端)", () => {
    const {view, get} = open();
    const r = SETTINGS_LAYOUT.slider;
    view.pointer?.({
      type: "down",
      x: r.x + r.width - 1,
      y: r.y + 10,
      button: 0,
    });
    expect(get()).toBe(3);
    view.pointer?.({type: "move", x: r.x - 100, y: r.y + 10, button: -1});
    expect(get()).toBeCloseTo(0.2);
    view.pointer?.({type: "up", x: r.x - 100, y: r.y + 10, button: 0});
  });

  it("既定に戻すで 1 にする。既定のときは押せない", () => {
    const {view, mouse, get} = open(2.5);
    clickAt(view, SETTINGS_LAYOUT.reset);
    expect(get()).toBe(1);
    mouse.set.mockClear();
    clickAt(view, SETTINGS_LAYOUT.reset);
    expect(mouse.set).not.toHaveBeenCalled();
  });

  it("スライダーをつかんだまま離れたら、戻ってから空いた所をドラッグしても感度は変わらない", () => {
    const {view, get} = open();
    const r = SETTINGS_LAYOUT.slider;
    view.pointer?.({
      type: "down",
      x: r.x + r.width / 2,
      y: r.y + 10,
      button: 0,
    });
    const before = get();
    view.cancel?.();
    view.pointer?.({type: "down", x: 2, y: 2, button: 0});
    view.pointer?.({
      type: "move",
      x: r.x + r.width - 1,
      y: r.y + 10,
      button: -1,
    });
    expect(get()).toBe(before);
  });

  it("OK で自分の窓を閉じる", () => {
    const {view, close} = open();
    clickAt(view, SETTINGS_LAYOUT.ok);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("ほかの所で感度が変わっても描き直させ、閉じたら購読をやめる", () => {
    const {view, mouse, listeners} = open();
    const listener = vi.fn();
    view.subscribe?.(listener);
    mouse.set({sensitivity: 2});
    expect(listener).toHaveBeenCalledTimes(1);
    view.dispose?.();
    expect(listeners.size).toBe(0);
  });
});
