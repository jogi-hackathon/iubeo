import {afterEach, describe, expect, it, vi} from "vitest";

import {
  getDpr,
  getRenderScale,
  graphicsStore,
  parseGraphicsSettings,
} from "../graphics";

const DEFAULTS = {resolutionScale: 0.75, fpsLimit: 60};

const GRAPHICS_KEY = "iubeo:graphics";

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

describe("graphicsStore の配線", () => {
  afterEach(() => {
    graphicsStore.reset();
    vi.unstubAllGlobals();
  });

  it("set した設定は iubeo:graphics に JSON で保存され、reset で消える", () => {
    const storage = createMemoryLocalStorage();
    vi.stubGlobal("localStorage", storage);

    graphicsStore.set({resolutionScale: 0.5, fpsLimit: 30});
    expect(JSON.parse(storage.map.get(GRAPHICS_KEY) ?? "null")).toEqual({
      resolutionScale: 0.5,
      fpsLimit: 30,
    });

    graphicsStore.reset();
    expect(storage.map.has(GRAPHICS_KEY)).toBe(false);
  });
});

describe("getDpr / getRenderScale", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("1 以下の resolutionScale は Canvas ではなく内部解像度で落とす", () => {
    vi.stubGlobal("window", {devicePixelRatio: 2});
    const s = {resolutionScale: 0.75, fpsLimit: 60};
    expect(getDpr(s)).toBe(2);
    expect(getRenderScale(s)).toBe(0.75);
  });

  it("1 を超える分(スーパーサンプリング)だけ Canvas を大きくする", () => {
    vi.stubGlobal("window", {devicePixelRatio: 2});
    const s = {resolutionScale: 1.5, fpsLimit: 60};
    expect(getDpr(s)).toBe(3);
    expect(getRenderScale(s)).toBe(1);
  });
});

describe("parseGraphicsSettings", () => {
  it("オブジェクトでなければ DEFAULTS 相当を返す", () => {
    expect(parseGraphicsSettings(null)).toEqual(DEFAULTS);
    expect(parseGraphicsSettings(3)).toEqual(DEFAULTS);
    expect(parseGraphicsSettings("text")).toEqual(DEFAULTS);
  });

  it("resolutionScale は 0.25〜2 に丸める", () => {
    expect(parseGraphicsSettings({resolutionScale: 0.1}).resolutionScale).toBe(
      0.25,
    );
    expect(parseGraphicsSettings({resolutionScale: 5}).resolutionScale).toBe(2);
    expect(parseGraphicsSettings({resolutionScale: 1.5}).resolutionScale).toBe(
      1.5,
    );
  });

  it("resolutionScale の不正型・NaN は既定値", () => {
    expect(parseGraphicsSettings({resolutionScale: "2"}).resolutionScale).toBe(
      DEFAULTS.resolutionScale,
    );
    expect(parseGraphicsSettings({resolutionScale: NaN}).resolutionScale).toBe(
      DEFAULTS.resolutionScale,
    );
  });

  it("fpsLimit が null・0以下・NaN なら既定値", () => {
    expect(parseGraphicsSettings({fpsLimit: null}).fpsLimit).toBe(
      DEFAULTS.fpsLimit,
    );
    expect(parseGraphicsSettings({fpsLimit: 0}).fpsLimit).toBe(
      DEFAULTS.fpsLimit,
    );
    expect(parseGraphicsSettings({fpsLimit: -30}).fpsLimit).toBe(
      DEFAULTS.fpsLimit,
    );
    expect(parseGraphicsSettings({fpsLimit: NaN}).fpsLimit).toBe(
      DEFAULTS.fpsLimit,
    );
  });

  it("fpsLimit が 1〜19 なら 20 に丸める", () => {
    expect(parseGraphicsSettings({fpsLimit: 1}).fpsLimit).toBe(20);
    expect(parseGraphicsSettings({fpsLimit: 19}).fpsLimit).toBe(20);
  });

  it("正常値はそのまま返す", () => {
    expect(parseGraphicsSettings({resolutionScale: 0.5, fpsLimit: 60})).toEqual(
      {resolutionScale: 0.5, fpsLimit: 60},
    );
  });
});
