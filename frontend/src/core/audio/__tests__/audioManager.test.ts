import {describe, expect, it, vi} from "vitest";

import {type AudioSettings, DEFAULT_AUDIO_SETTINGS} from "../../audioSettings";
import {createAudioManager} from "../audioManager";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const fakeNode = () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  gain: {value: 1},
  threshold: {value: 0},
  knee: {value: 0},
  ratio: {value: 0},
  attack: {value: 0},
  release: {value: 0},
  fftSize: 0,
  getFloatTimeDomainData: vi.fn((_buf: Float32Array) => {}),
});

const fakeContext = () => {
  const sinkCalls: string[] = [];
  let failSink: string | null = null;
  const ctx = {
    state: "suspended",
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = "running";
    }),
    createDynamicsCompressor: fakeNode,
    createGain: fakeNode,
    createAnalyser: () => {
      const node = fakeNode();
      node.getFloatTimeDomainData.mockImplementation((buf: Float32Array) => {
        buf[3] = -0.25;
      });
      return node;
    },
    listener: {
      positionX: {value: 0},
      positionY: {value: 0},
      positionZ: {value: 0},
      forwardX: {value: 0},
      forwardY: {value: 0},
      forwardZ: {value: 0},
      upX: {value: 0},
      upY: {value: 0},
      upZ: {value: 0},
    },
    createMediaStreamSource: vi.fn(() => fakeNode()),
    setSinkId: vi.fn(async (id: string) => {
      sinkCalls.push(id);
      if (id === failSink) {
        throw new Error("gone");
      }
    }),
  };
  return {
    ctx,
    sinkCalls,
    failSinkOn: (id: string) => {
      failSink = id;
    },
  };
};

const fakeMedia = () => {
  const requests: (string | null)[] = [];
  const streams: {stop: ReturnType<typeof vi.fn>}[] = [];
  let failExact = false;
  const media = {
    getUserMedia: vi.fn(async (c: MediaStreamConstraints) => {
      const audio = c.audio as {deviceId?: {exact: string}};
      const id = audio.deviceId?.exact ?? null;
      requests.push(id);
      if (id !== null && failExact) {
        throw new Error("overconstrained");
      }
      const stop = vi.fn();
      streams.push({stop});
      return {getTracks: () => [{stop}]} as unknown as MediaStream;
    }),
    enumerateDevices: vi.fn(async () => []),
  };
  return {
    media: media as unknown as MediaDevices,
    requests,
    streams,
    failExact: () => {
      failExact = true;
    },
  };
};

const fakeSettings = () => {
  let state: AudioSettings = {...DEFAULT_AUDIO_SETTINGS};
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    set: (patch: Partial<AudioSettings>) => {
      state = {...state, ...patch};
      for (const l of Array.from(listeners)) {
        l();
      }
    },
  };
};

const make = (initial: Partial<AudioSettings> = {}) => {
  const settings = fakeSettings();
  settings.set(initial);
  const context = fakeContext();
  const media = fakeMedia();
  const created = vi.fn(() => context.ctx as unknown as AudioContext);
  const manager = createAudioManager({
    settings,
    createContext: created,
    mediaDevices: () => media.media,
  });
  return {settings, context, media, created, manager};
};

describe("audioManager", () => {
  it("AudioContext は最初に使うときに 1 つだけ作る", () => {
    const {manager, created} = make();
    expect(created).not.toHaveBeenCalled();
    manager.voiceBus();
    manager.gameBus();
    manager.context();
    expect(created).toHaveBeenCalledTimes(1);
  });

  it("設定の音量をバスへ反映し、変えたらその場で追従する", () => {
    const {manager, settings} = make({gameVolume: 0.5, voiceVolume: 1.5});
    expect(manager.gameBus().gain.value).toBe(0.5);
    expect(manager.voiceBus().gain.value).toBe(1.5);
    settings.set({voiceVolume: 0.25});
    expect(manager.voiceBus().gain.value).toBe(0.25);
  });

  it("スピーカーの切り替えは直列で、同じ要求は繰り返さず、失敗したら既定へ戻す", async () => {
    const {manager, settings, context} = make({outputDeviceId: "a"});
    manager.context();
    settings.set({outputDeviceId: "b"});
    settings.set({outputDeviceId: "b"});
    await flush();
    expect(context.sinkCalls).toEqual(["b"]);
    context.failSinkOn("c");
    settings.set({outputDeviceId: "c"});
    await flush();
    expect(context.sinkCalls).toEqual(["b", "c", ""]);
  });

  it("マイクは参照を数え、最初の取得で開いて最後の解放でトラックを止める", async () => {
    const {manager, media} = make();
    const [h1, h2] = await Promise.all([
      manager.acquireMic(),
      manager.acquireMic(),
    ]);
    expect(media.requests).toEqual([null]);
    h1.release();
    h1.release();
    await flush();
    expect(media.streams[0]!.stop).not.toHaveBeenCalled();
    h2.release();
    await flush();
    expect(media.streams[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it("解放してすぐ取り直したら、マイクを開き直さない", async () => {
    const {manager, media} = make();
    const h1 = await manager.acquireMic();
    h1.release();
    const h2 = await manager.acquireMic();
    await flush();
    expect(media.requests).toEqual([null]);
    expect(media.streams[0]!.stop).not.toHaveBeenCalled();
    h2.release();
  });

  it("選んだマイクが開けなければ、既定のマイクへ戻す", async () => {
    const {manager, media} = make({inputDeviceId: "gone"});
    media.failExact();
    const h = await manager.acquireMic();
    expect(media.requests).toEqual(["gone", null]);
    h.release();
  });

  it("使用中に入力デバイスを変えると付け替え、直列に 1 回ずつ開く", async () => {
    const {manager, media, settings} = make({inputDeviceId: "a"});
    const h = await manager.acquireMic();
    settings.set({inputDeviceId: "b"});
    settings.set({inputDeviceId: "b"});
    await flush();
    expect(media.requests).toEqual(["a", "b"]);
    expect(media.streams[0]!.stop).toHaveBeenCalledTimes(1);
    expect(media.streams[1]!.stop).not.toHaveBeenCalled();
    h.release();
    await flush();
    expect(media.streams[1]!.stop).toHaveBeenCalledTimes(1);
  });

  it("付け替えに失敗しても、自分では繰り返し試さない", async () => {
    const {manager, media, settings} = make();
    media.failExact();
    const h = await manager.acquireMic();
    settings.set({inputDeviceId: "x"});
    await flush();
    await flush();
    expect(media.requests).toEqual([null, "x", null]);
    h.release();
  });

  it("マイクの音量を micGain へ反映する", async () => {
    const {manager, settings} = make({micVolume: 1.5});
    const h = await manager.acquireMic();
    expect((h.node as unknown as {gain: {value: number}}).gain.value).toBe(1.5);
    settings.set({micVolume: 0.5});
    expect((h.node as unknown as {gain: {value: number}}).gain.value).toBe(0.5);
    h.release();
  });

  it("micLevel は、マイクを取っていなければ 0、取っていれば波形のピークを返す", async () => {
    const {manager} = make();
    expect(manager.micLevel()).toBe(0);
    const h = await manager.acquireMic();
    expect(manager.micLevel()).toBe(0.5);
    h.release();
    await flush();
    expect(manager.micLevel()).toBe(0);
  });

  it("unlock は止まっているときだけ resume する", async () => {
    const {manager, context} = make();
    manager.unlock();
    expect(context.ctx.resume).not.toHaveBeenCalled();
    manager.context();
    manager.unlock();
    await flush();
    manager.unlock();
    expect(context.ctx.resume).toHaveBeenCalledTimes(1);
  });

  it("setListener は聞き手の位置と向きを AudioListener へ書く", () => {
    const {manager, context, created} = make();
    const pos = {x: 1, y: 2, z: 3};
    const fwd = {x: 0, y: 0, z: -1};
    const up = {x: 0, y: 1, z: 0};
    manager.setListener(pos, fwd, up);
    expect(created).not.toHaveBeenCalled();
    manager.context();
    manager.setListener(pos, fwd, up);
    const l = context.ctx.listener;
    expect([l.positionX.value, l.positionY.value, l.positionZ.value]).toEqual([
      1, 2, 3,
    ]);
    expect([l.forwardX.value, l.forwardY.value, l.forwardZ.value]).toEqual([
      0, 0, -1,
    ]);
    expect([l.upX.value, l.upY.value, l.upZ.value]).toEqual([0, 1, 0]);
  });

  it("micMeter は start でマイクを取り、返り値で放す(取得前に止めても放す)", async () => {
    const {manager, media} = make();
    const stop = manager.micMeter.start();
    stop();
    await flush();
    await flush();
    expect(media.streams[0]!.stop).toHaveBeenCalledTimes(1);
  });
});
