import { afterEach, describe, expect, it, vi } from "vitest";
import { afterRendererInit } from "./afterRendererInit";
import { type BootProgress, type BootStep, runSteps } from "./boot";
import { createBootStore } from "./bootStore";
import { detectCapabilities } from "./capabilities";
import type { AppContext } from "./context";

const ctx: AppContext = {
  settings: { resolutionScale: 1, fpsLimit: null },
  capabilities: { rendererBackend: "webgl" },
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
    run: (d) => {
      log.push("b");
      d.capabilities = ctx.capabilities;
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
      { step: "a", index: 0, total: 3 },
      { step: "b", index: 1, total: 3 },
      { step: "c", index: 2, total: 3 },
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

describe("detectCapabilities", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const stubNavigator = (gpu: unknown) =>
    vi.stubGlobal("navigator", gpu === undefined ? {} : { gpu });

  it("adapter があれば webgpu(three と同じ compatibility で要求する)", async () => {
    const requestAdapter = vi.fn(async () => ({}));
    stubNavigator({ requestAdapter });
    expect((await detectCapabilities()).rendererBackend).toBe("webgpu");
    expect(requestAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ featureLevel: "compatibility" }),
    );
  });

  it("navigator.gpu がなければ webgl2-fallback", async () => {
    stubNavigator(undefined);
    expect((await detectCapabilities()).rendererBackend).toBe(
      "webgl2-fallback",
    );
  });

  it("adapter が null なら false", async () => {
    stubNavigator({ requestAdapter: async () => null });
    expect((await detectCapabilities()).rendererBackend).toBe(
      "webgl2-fallback",
    );
  });

  it("requestAdapter が例外なら false", async () => {
    stubNavigator({
      requestAdapter: async () => {
        throw new Error("x");
      },
    });
    expect((await detectCapabilities()).rendererBackend).toBe(
      "webgl2-fallback",
    );
  });

  it("VITE_RENDERER=webgl なら GPU があっても webgl", async () => {
    vi.stubEnv("VITE_RENDERER", "webgl");
    stubNavigator({ requestAdapter: async () => ({}) });
    expect((await detectCapabilities()).rendererBackend).toBe("webgl");
  });
});

describe("afterRendererInit", () => {
  const make = (): AppContext => ({
    ...ctx,
    capabilities: { ...ctx.capabilities, rendererBackend: "webgpu" },
  });

  it("実際のバックエンドを反映する", () => {
    const a = make();
    afterRendererInit({ backend: { isWebGPUBackend: true } }, a);
    expect(a.capabilities.rendererBackend).toBe("webgpu");
    const b = make();
    afterRendererInit({ backend: {} }, b);
    expect(b.capabilities.rendererBackend).toBe("webgl2-fallback");
    const c = make();
    afterRendererInit({ isWebGLRenderer: true }, c);
    expect(c.capabilities.rendererBackend).toBe("webgl");
  });
});
