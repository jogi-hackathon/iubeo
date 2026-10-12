import {describe, expect, it, vi} from "vitest";

import type {AudioDeviceList} from "../../../../../core/audio/devices";
import {
  type AudioSettings,
  DEFAULT_AUDIO_SETTINGS,
} from "../../../../../core/audioSettings";
import type {GraphicsSettings} from "../../../../../core/graphics";
import type {GameFlowState} from "../../../../../flow";
import type {AppView} from "../../kernel/app";
import type {Rect} from "../../kernel/geometry";
import {DROPDOWN_ITEM_HEIGHT} from "../../toolkit/controls";
import {
  createMatchmakingApp,
  MATCHMAKING_LAYOUT,
  matchmakingLines,
} from "../matchmaking";
import {createSettingsApp, SETTINGS_LAYOUT, SETTINGS_TAB} from "../settings";

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
    const launch = vi.fn();
    const view = app.open({close: () => {}, launch});
    return {flow, timers, view, launch};
  };

  it("「VC の設定…」は、設定のサウンドのタブを開くよう頼む", () => {
    const {view, launch} = open();
    clickAt(view, MATCHMAKING_LAYOUT.voice);
    expect(launch).toHaveBeenCalledWith("settings", {tab: "sound"});
  });

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

const fakeFrames = () => {
  const running = new Set<() => void>();
  const frames = vi.fn((fn: () => void) => {
    running.add(fn);
    return () => {
      running.delete(fn);
    };
  });
  return {frames, running, tick: () => running.forEach((fn) => fn())};
};

const fakePort = <T>(initial: T) => {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    set: vi.fn((next: T) => {
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
    listeners,
  };
};

describe("設定のアプリ", () => {
  const open = ({
    sensitivity = 1,
    canSelectOutput = true,
    needsPermission = false,
    tab,
  }: {
    sensitivity?: number;
    canSelectOutput?: boolean;
    needsPermission?: boolean;
    tab?: string;
  } = {}) => {
    const mouse = fakePort({sensitivity});
    const graphics = fakePort<GraphicsSettings>({
      resolutionScale: 0.5,
      fpsLimit: 60,
    });
    const audio = fakePort<AudioSettings>({...DEFAULT_AUDIO_SETTINGS});
    const deviceList: AudioDeviceList = {
      inputs: [{id: "mic-a", label: "USB マイク"}],
      outputs: [{id: "spk-a", label: "ヘッドホン"}],
      canSelectOutput,
      needsPermission,
    };
    const devices = {
      ...fakePort(deviceList),
      refresh: vi.fn(),
      requestPermission: vi.fn(),
    };
    let level = 0;
    const stopMeter = vi.fn();
    const micMeter = {
      start: vi.fn(() => stopMeter),
      level: () => level,
    };
    const timers = fakeFrames();
    const close = vi.fn();
    const app = createSettingsApp(
      {mouse, graphics, audio, devices, micMeter},
      timers.frames,
    );
    const view = app.open({close, launch: vi.fn()}, {tab});
    return {
      mouse,
      graphics,
      audio,
      devices,
      close,
      view,
      micMeter,
      stopMeter,
      timers,
      setLevel: (v: number) => {
        level = v;
      },
    };
  };

  const selectTab = (view: AppView, index: number) => {
    const r = SETTINGS_LAYOUT.tabs;
    const left = [0, 56, 104][index]!;
    view.pointer?.({type: "down", x: r.x + left + 10, y: r.y + 8, button: 0});
    view.pointer?.({type: "up", x: r.x + left + 10, y: r.y + 8, button: 0});
  };

  const pick = (view: AppView, box: Rect, index: number) => {
    clickAt(view, box);
    const y = box.y + box.height + 1 + index * DROPDOWN_ITEM_HEIGHT + 8;
    view.pointer?.({type: "down", x: box.x + 20, y, button: 0});
    view.pointer?.({type: "up", x: box.x + 20, y, button: 0});
  };

  it("スライダーを動かしても、適用するまで感度は保存しない", () => {
    const {view, mouse} = open();
    const r = SETTINGS_LAYOUT.mouse.slider;
    view.pointer?.({
      type: "down",
      x: r.x + r.width - 1,
      y: r.y + 10,
      button: 0,
    });
    view.pointer?.({type: "up", x: r.x + r.width - 1, y: r.y + 10, button: 0});
    expect(mouse.set).not.toHaveBeenCalled();
    clickAt(view, SETTINGS_LAYOUT.apply);
    expect(mouse.getState().sensitivity).toBe(3);
  });

  it("変えていなければ適用は押せない", () => {
    const {view, mouse, graphics, audio} = open();
    clickAt(view, SETTINGS_LAYOUT.apply);
    expect(mouse.set).not.toHaveBeenCalled();
    expect(graphics.set).not.toHaveBeenCalled();
    expect(audio.set).not.toHaveBeenCalled();
  });

  it("既定に戻すで下書きを 1 にする。既定のときは押せない", () => {
    const {view, mouse} = open({sensitivity: 2.5});
    clickAt(view, SETTINGS_LAYOUT.mouse.reset);
    clickAt(view, SETTINGS_LAYOUT.apply);
    expect(mouse.getState().sensitivity).toBe(1);
    mouse.set.mockClear();
    clickAt(view, SETTINGS_LAYOUT.mouse.reset);
    clickAt(view, SETTINGS_LAYOUT.apply);
    expect(mouse.set).not.toHaveBeenCalled();
  });

  it("画面のタブで解像度と FPS を選び、OK で保存して閉じる", () => {
    const {view, graphics, close} = open();
    selectTab(view, SETTINGS_TAB.graphics);
    pick(view, SETTINGS_LAYOUT.graphics.resolution, 3);
    pick(view, SETTINGS_LAYOUT.graphics.fps, 4);
    expect(graphics.set).not.toHaveBeenCalled();
    clickAt(view, SETTINGS_LAYOUT.ok);
    expect(graphics.getState()).toEqual({resolutionScale: 1, fpsLimit: null});
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("キャンセルは下書きを捨てて閉じる", () => {
    const {view, graphics, close} = open();
    selectTab(view, SETTINGS_TAB.graphics);
    pick(view, SETTINGS_LAYOUT.graphics.resolution, 0);
    clickAt(view, SETTINGS_LAYOUT.cancel);
    expect(graphics.set).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("開いた一覧の外を押すと閉じるだけで、下の部品は押されない", () => {
    const {view, graphics, close} = open();
    selectTab(view, SETTINGS_TAB.graphics);
    clickAt(view, SETTINGS_LAYOUT.graphics.resolution);
    clickAt(view, SETTINGS_LAYOUT.cancel);
    expect(close).not.toHaveBeenCalled();
    clickAt(view, SETTINGS_LAYOUT.apply);
    expect(graphics.set).not.toHaveBeenCalled();
  });

  it("サウンドのタブでデバイスと音量を変え、適用で保存する", () => {
    const {view, audio, devices} = open();
    selectTab(view, SETTINGS_TAB.sound);
    expect(devices.refresh).toHaveBeenCalled();
    pick(view, SETTINGS_LAYOUT.speaker.device, 1);
    pick(view, SETTINGS_LAYOUT.mic.device, 1);
    const r = SETTINGS_LAYOUT.mic.volume;
    view.pointer?.({type: "down", x: r.x, y: r.y + 10, button: 0});
    view.pointer?.({type: "up", x: r.x, y: r.y + 10, button: 0});
    clickAt(view, SETTINGS_LAYOUT.apply);
    expect(audio.getState()).toEqual({
      ...DEFAULT_AUDIO_SETTINGS,
      outputDeviceId: "spk-a",
      inputDeviceId: "mic-a",
      micVolume: 0,
    });
  });

  it("サウンドのタブを表示している間だけ、マイクのメーターを動かす", () => {
    const {view, micMeter, stopMeter, timers} = open();
    expect(micMeter.start).not.toHaveBeenCalled();
    selectTab(view, SETTINGS_TAB.sound);
    expect(micMeter.start).toHaveBeenCalledTimes(1);
    expect(timers.running.size).toBe(1);
    selectTab(view, SETTINGS_TAB.graphics);
    expect(stopMeter).toHaveBeenCalledTimes(1);
    expect(timers.running.size).toBe(0);
  });

  it("マイクの許可を待つ間はメーターを始めず、許可されたら始める", () => {
    const {view, devices, micMeter} = open({needsPermission: true});
    selectTab(view, SETTINGS_TAB.sound);
    expect(micMeter.start).not.toHaveBeenCalled();
    devices.set({...devices.getState(), needsPermission: false});
    expect(micMeter.start).toHaveBeenCalledTimes(1);
  });

  it("レベルが変わったときだけ描き直させ、窓を閉じたらメーターを止める", () => {
    const {view, setLevel, timers, stopMeter} = open({tab: "sound"});
    const listener = vi.fn();
    view.subscribe?.(listener);
    const step = () => {
      timers.tick();
      timers.tick();
    };
    step();
    expect(listener).not.toHaveBeenCalled();
    setLevel(0.5);
    timers.tick();
    expect(listener).not.toHaveBeenCalled();
    timers.tick();
    expect(listener).toHaveBeenCalledTimes(1);
    setLevel(0);
    step();
    expect(listener).toHaveBeenCalledTimes(2);
    view.dispose?.();
    expect(stopMeter).toHaveBeenCalledTimes(1);
    expect(timers.running.size).toBe(0);
  });

  it("PC から離れたらメーターを止め、戻って触ったら再開する", () => {
    const {view, micMeter, stopMeter} = open({tab: "sound"});
    view.cancel?.();
    expect(stopMeter).toHaveBeenCalledTimes(1);
    view.pointer?.({type: "move", x: 1, y: 1, button: -1});
    expect(micMeter.start).toHaveBeenCalledTimes(2);
  });

  it("開くときと、開いた後の reveal でタブを指定できる", () => {
    const sound = open({tab: "sound"});
    expect(sound.micMeter.start).toHaveBeenCalledTimes(1);

    const {view, micMeter} = open();
    expect(micMeter.start).not.toHaveBeenCalled();
    view.reveal?.({tab: "sound"});
    expect(micMeter.start).toHaveBeenCalledTimes(1);
    view.reveal?.({});
    expect(micMeter.start).toHaveBeenCalledTimes(1);
  });

  it("スピーカーを選べないブラウザでは、スピーカーの一覧を開けない", () => {
    const {view, audio} = open({canSelectOutput: false});
    selectTab(view, SETTINGS_TAB.sound);
    pick(view, SETTINGS_LAYOUT.speaker.device, 1);
    clickAt(view, SETTINGS_LAYOUT.apply);
    expect(audio.set).not.toHaveBeenCalled();
  });

  it("マイクを許可していないときだけ、デバイスを読み込むボタンで許可を求める", () => {
    const allowed = open();
    selectTab(allowed.view, SETTINGS_TAB.sound);
    clickAt(allowed.view, SETTINGS_LAYOUT.loadDevices);
    expect(allowed.devices.requestPermission).not.toHaveBeenCalled();

    const blocked = open({needsPermission: true});
    selectTab(blocked.view, SETTINGS_TAB.sound);
    clickAt(blocked.view, SETTINGS_LAYOUT.loadDevices);
    expect(blocked.devices.requestPermission).toHaveBeenCalledTimes(1);
  });

  it("スライダーをつかんだまま離れたら、戻ってから空いた所をドラッグしても下書きは変わらない", () => {
    const {view, mouse} = open();
    const r = SETTINGS_LAYOUT.mouse.slider;
    view.pointer?.({
      type: "down",
      x: r.x + r.width / 2,
      y: r.y + 10,
      button: 0,
    });
    view.cancel?.();
    clickAt(view, SETTINGS_LAYOUT.apply);
    const before = mouse.getState().sensitivity;
    view.pointer?.({type: "down", x: 2, y: 2, button: 0});
    view.pointer?.({
      type: "move",
      x: r.x + r.width - 1,
      y: r.y + 10,
      button: -1,
    });
    view.pointer?.({type: "up", x: r.x + r.width - 1, y: r.y + 10, button: 0});
    clickAt(view, SETTINGS_LAYOUT.apply);
    expect(mouse.getState().sensitivity).toBe(before);
  });

  it("ほかの所で設定が変わっても描き直させ、閉じたら購読をやめる", () => {
    const {view, mouse, graphics, audio, devices} = open();
    const listener = vi.fn();
    view.subscribe?.(listener);
    mouse.set({sensitivity: 2});
    expect(listener).toHaveBeenCalledTimes(1);
    view.dispose?.();
    for (const port of [mouse, graphics, audio, devices]) {
      expect(port.listeners.size).toBe(0);
    }
  });
});
