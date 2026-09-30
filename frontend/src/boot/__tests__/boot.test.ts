import {afterEach, describe, expect, it, vi} from "vitest";

import {afterRendererInit} from "../afterRendererInit";
import {BOOT_STEPS, type BootProgress, type BootStep, runSteps} from "../boot";
import {createBootStore} from "../bootStore";
import {assertWebGPUAvailable, WebGPUUnavailableError} from "../capabilities";
import type {AppContext} from "../context";

const ctx: AppContext = {
  settings: {resolutionScale: 1, fpsLimit: null},
  assets: {},
};

const completeSteps = (log: string[]): BootStep[] => [
  {
    name: "a",
    run: async (d) => {
      log.push("a");
      d.settings = ctx.settings;
    },
  },
  {
    name: "b",
    run: () => {
      log.push("b");
    },
  },
  {
    name: "c",
    run: async (d) => {
      log.push("c");
      d.assets = ctx.assets;
    },
  },
];

describe("runSteps", () => {
  it("ステップを順に実行し、開始ごとに onProgress を呼ぶ", async () => {
    const log: string[] = [];
    const progress: BootProgress[] = [];
    const result = await runSteps(completeSteps(log), (p) => progress.push(p));
    expect(log).toEqual(["a", "b", "c"]);
    expect(progress).toEqual([
      {step: "a", index: 0, total: 3},
      {step: "b", index: 1, total: 3},
      {step: "c", index: 2, total: 3},
    ]);
    expect(result).toEqual(ctx);
  });

  it("ステップが例外を投げたら reject し、後続を実行しない", async () => {
    const log: string[] = [];
    const steps = completeSteps(log);
    steps.splice(1, 0, {
      name: "bad",
      run: () => {
        throw new Error("boom");
      },
    });
    await expect(runSteps(steps, () => {})).rejects.toThrow("boom");
    expect(log).toEqual(["a"]);
  });

  it("AppContext が揃わなければ reject する", async () => {
    await expect(runSteps([], () => {})).rejects.toThrow();
  });
});

describe("createBootStore", () => {
  it("start を複数回呼んでも boot は1回だけ実行される", async () => {
    const run = vi.fn(async () => ctx);
    const store = createBootStore(run);
    store.start();
    store.start();
    await vi.waitFor(() => expect(store.getState().status).toBe("ready"));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("boot 失敗で error 状態になる", async () => {
    const store = createBootStore(async () => {
      throw new Error("fail");
    });
    store.start();
    await vi.waitFor(() => expect(store.getState().status).toBe("error"));
    const s = store.getState();
    expect(s.status === "error" && s.error.message).toBe("fail");
  });
});

describe("assertWebGPUAvailable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubNavigator = (gpu: unknown) =>
    vi.stubGlobal("navigator", gpu === undefined ? {} : {gpu});

  it("adapter があれば通る(three と同じ compatibility で要求する)", async () => {
    const requestAdapter = vi.fn(async () => ({}));
    stubNavigator({requestAdapter});
    await expect(assertWebGPUAvailable()).resolves.toBeUndefined();
    expect(requestAdapter).toHaveBeenCalledWith(
      expect.objectContaining({featureLevel: "compatibility"}),
    );
  });

  it("navigator.gpu がなければ unsupported", async () => {
    stubNavigator(undefined);
    await expect(assertWebGPUAvailable()).rejects.toMatchObject({
      name: "WebGPUUnavailableError",
      reason: "unsupported",
    });
  });

  it("adapter が null なら no-adapter", async () => {
    stubNavigator({requestAdapter: async () => null});
    await expect(assertWebGPUAvailable()).rejects.toMatchObject({
      reason: "no-adapter",
    });
  });

  it("requestAdapter が例外なら no-adapter", async () => {
    stubNavigator({
      requestAdapter: async () => {
        throw new Error("x");
      },
    });
    await expect(assertWebGPUAvailable()).rejects.toMatchObject({
      reason: "no-adapter",
    });
  });

  it("boot のステップとして実行すると error 状態になる", async () => {
    stubNavigator(undefined);
    const webgpu = BOOT_STEPS.find((s) => s.name === "webgpu");
    if (!webgpu) {
      throw new Error("webgpu ステップが無い");
    }
    const store = createBootStore((onProgress) =>
      runSteps([webgpu], onProgress),
    );
    store.start();
    await vi.waitFor(() => expect(store.getState().status).toBe("error"));
    const s = store.getState();
    expect(s.status === "error" && s.error).toBeInstanceOf(
      WebGPUUnavailableError,
    );
    expect(s.status === "error" && s.error.message).toContain("WebGPU");
  });

  it("使えるときは boot が ready まで進む", async () => {
    stubNavigator({requestAdapter: async () => ({})});
    const webgpu = BOOT_STEPS.find((s) => s.name === "webgpu");
    if (!webgpu) {
      throw new Error("webgpu ステップが無い");
    }
    const store = createBootStore((onProgress) =>
      runSteps([...completeSteps([]), webgpu], onProgress),
    );
    store.start();
    await vi.waitFor(() => expect(store.getState().status).toBe("ready"));
  });
});

describe("afterRendererInit", () => {
  it("WebGPU バックエンドなら通る", () => {
    expect(() =>
      afterRendererInit({backend: {isWebGPUBackend: true}}),
    ).not.toThrow();
  });

  it("WebGL2 へフォールバックしていたら init-failed", () => {
    expect(() => afterRendererInit({backend: {}})).toThrow(
      WebGPUUnavailableError,
    );
    expect(() => afterRendererInit({})).toThrow(WebGPUUnavailableError);
  });
});
