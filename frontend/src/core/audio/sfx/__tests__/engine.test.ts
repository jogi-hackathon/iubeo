import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("../tone", () => ({setContext: vi.fn(), now: vi.fn(() => 0)}));
vi.mock("../recipes", () => ({RECIPES: {}}));

import {createSfxEngine, type SfxRecipes} from "../engine";
import type {SfxId} from "../types";

const param = () => ({value: 0, setValueAtTime: vi.fn()});

const fakeNode = () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  gain: {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  },
});

const fakeAudio = () => {
  const gameBus = fakeNode();
  const panners: ReturnType<typeof fakePanner>[] = [];
  const fakePanner = () => ({
    ...fakeNode(),
    panningModel: "",
    distanceModel: "",
    refDistance: 0,
    maxDistance: 0,
    rolloffFactor: 0,
    positionX: param(),
    positionY: param(),
    positionZ: param(),
  });
  const gains: ReturnType<typeof fakeNode>[] = [];
  const ctx = {
    currentTime: 1.5,
    createGain: vi.fn(() => {
      const g = fakeNode();
      gains.push(g);
      return g;
    }),
    createPanner: vi.fn(() => {
      const p = fakePanner();
      panners.push(p);
      return p;
    }),
  };
  return {
    audio: {
      context: vi.fn(() => ctx as unknown as AudioContext),
      gameBus: vi.fn(() => gameBus as unknown as GainNode),
    },
    ctx,
    gameBus,
    panners,
    gains,
  };
};

const fakeVoice = () => ({
  play: vi.fn(),
  stop: vi.fn(),
  dispose: vi.fn(),
});

const fakeRecipes = () => {
  const voices = {} as Record<SfxId, ReturnType<typeof fakeVoice>>;
  const recipes = {} as Record<SfxId, unknown>;
  for (const id of ["pcFan", "writing", "shatter"] as const) {
    const voice = fakeVoice();
    voices[id] = voice;
    recipes[id] = {id, make: vi.fn(() => voice)};
  }
  return {
    voices,
    recipes: recipes as unknown as SfxRecipes,
    make: (id: SfxId) => (recipes[id] as {make: ReturnType<typeof vi.fn>}).make,
  };
};

const make = () => {
  const a = fakeAudio();
  const r = fakeRecipes();
  const tone = {setContext: vi.fn(), now: vi.fn(() => 10)};
  const engine = createSfxEngine({
    audio: a.audio,
    recipes: r.recipes,
    tone,
  });
  return {...a, ...r, tone, engine};
};

describe("sfxEngine", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emitter は渡した recipe だけ make し、Tone の context は 1 回だけ設定する", () => {
    const t = make();
    expect(t.tone.setContext).not.toHaveBeenCalled();
    t.engine.emitter(["pcFan"]);
    t.engine.emitter(["pcFan", "shatter"]);
    expect(t.make("pcFan")).toHaveBeenCalledTimes(2);
    expect(t.make("shatter")).toHaveBeenCalledTimes(1);
    expect(t.make("writing")).not.toHaveBeenCalled();
    expect(t.tone.setContext).toHaveBeenCalledTimes(1);
  });

  it("emitter は入力 Gain から Panner と出力 Gain を通って gameBus へつなぐ", () => {
    const t = make();
    t.engine.emitter(["pcFan"], {x: 1, y: 2, z: 3});
    const [input, output] = t.gains;
    const panner = t.panners[0]!;
    expect(panner.panningModel).toBe("HRTF");
    expect(panner.distanceModel).toBe("inverse");
    expect(panner.refDistance).toBe(5);
    expect(panner.maxDistance).toBe(40);
    const trim = t.gains[2]!;
    expect(input!.connect).toHaveBeenCalledWith(panner);
    expect(panner.connect).toHaveBeenCalledWith(output);
    expect(output!.connect).toHaveBeenCalledWith(t.gameBus);
    expect(trim.connect).toHaveBeenCalledWith(input);
    expect(t.make("pcFan")).toHaveBeenCalledWith(trim);
    expect(panner.positionX.setValueAtTime).toHaveBeenCalledWith(1, 1.5);
    expect(panner.positionZ.setValueAtTime).toHaveBeenCalledWith(3, 1.5);
  });

  it("setPosition は setValueAtTime が無ければ value へ書く", () => {
    const t = make();
    const e = t.engine.emitter(["pcFan"]);
    const panner = t.panners[0]!;
    panner.positionY = {value: 0} as never;
    e.setPosition({x: 0, y: 7, z: 0});
    expect(panner.positionY.value).toBe(7);
  });

  it("play は now と options を voice へ渡し、stop と dispose も voice へ届く", () => {
    const t = make();
    const e = t.engine.emitter(["pcFan", "shatter"]);
    e.play("pcFan");
    expect(t.voices.pcFan.play).toHaveBeenCalledWith(10, undefined);
    e.stop("pcFan");
    expect(t.voices.pcFan.stop).toHaveBeenCalledWith(10);
    e.dispose();
    e.dispose();
    expect(t.voices.pcFan.dispose).not.toHaveBeenCalled();
    expect(t.gains[1]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      0,
      1.5 + 0.03,
    );
    vi.advanceTimersByTime(50);
    expect(t.voices.pcFan.dispose).toHaveBeenCalledTimes(1);
    expect(t.voices.shatter.dispose).toHaveBeenCalledTimes(1);
    expect(t.panners[0]!.disconnect).toHaveBeenCalled();
  });

  it("writing の options はそのまま渡る", () => {
    const t = make();
    const cue = {beats: [], lines: [], startIn: 0.1};
    t.engine.emitter(["writing"]).play("writing", cue);
    expect(t.voices.writing.play).toHaveBeenCalledWith(10, cue);
  });

  it("登録していない id は warn して無視する", () => {
    const t = make();
    const e = t.engine.emitter(["pcFan"]);
    e.play("shatter");
    e.stop("shatter");
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(t.voices.shatter.play).not.toHaveBeenCalled();
    expect(t.voices.shatter.stop).not.toHaveBeenCalled();
  });

  it("them は gameBus へ直結した voice を recipe ごとに 1 つ作って再利用する", () => {
    const t = make();
    t.engine.them("shatter");
    t.engine.them("shatter");
    expect(t.make("shatter")).toHaveBeenCalledTimes(1);
    expect(t.make("shatter")).toHaveBeenCalledWith(t.gains[0]);
    expect(t.gains[0]!.connect).toHaveBeenCalledWith(t.gameBus);
    expect(t.voices.shatter.play).toHaveBeenCalledTimes(2);
    expect(t.voices.shatter.play).toHaveBeenCalledWith(10, undefined);
    expect(t.ctx.createPanner).not.toHaveBeenCalled();
  });

  it("setTrim は emitter と them の Gain に反映され、dispose 後は外れる", () => {
    const t = make();
    const e = t.engine.emitter(["pcFan"]);
    t.engine.them("pcFan");
    const emitterTrim = t.gains[2]!;
    const themTrim = t.gains[3]!;
    t.engine.setTrim("pcFan", -20);
    expect(t.engine.trim("pcFan")).toBe(-20);
    expect(emitterTrim.gain.value).toBeCloseTo(0.1);
    expect(themTrim.gain.value).toBeCloseTo(0.1);
    e.dispose();
    vi.advanceTimersByTime(50);
    t.engine.setTrim("pcFan", 0);
    expect(emitterTrim.gain.value).toBeCloseTo(0.1);
    expect(themTrim.gain.value).toBe(1);
  });

  it("stopThem は them の voice を止め、無ければ何もしない", () => {
    const t = make();
    t.engine.stopThem("pcFan");
    t.engine.them("pcFan");
    t.engine.stopThem("pcFan");
    expect(t.voices.pcFan.stop).toHaveBeenCalledWith(10);
  });

  it("now は Tone の now を返す", () => {
    expect(make().engine.now()).toBe(10);
  });
});
