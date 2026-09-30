/** 実際に使われるレンダラーバックエンド。detectCapabilities の値は「予定」で、afterRendererInit が実測で上書きして確定する */
export type RendererBackend = "webgpu" | "webgl2-fallback" | "webgl";

export interface Capabilities {
  rendererBackend: RendererBackend;
}

interface GpuLike {
  requestAdapter(options?: object): Promise<unknown>;
}

/** three の WebGPUBackend.init と同じ条件で adapter を取る(core 相当だと compat 専用端末で WebGPU を取りこぼす) */
const ADAPTER_OPTIONS = {
  featureLevel: "compatibility",
  powerPreference: "high-performance",
};

const wantsWebGPU = (): boolean =>
  (import.meta.env.VITE_RENDERER ?? "webgpu") === "webgpu";

const detectWebGPU = async (): Promise<boolean> => {
  if (!wantsWebGPU()) {
    return false;
  }
  try {
    const gpu = (globalThis.navigator as {gpu?: GpuLike} | undefined)?.gpu;
    if (!gpu) {
      return false;
    }
    return (await gpu.requestAdapter(ADAPTER_OPTIONS)) !== null;
  } catch {
    return false;
  }
};

export const detectCapabilities = async (): Promise<Capabilities> => {
  const rendererBackend: RendererBackend = (await detectWebGPU())
    ? "webgpu"
    : wantsWebGPU()
      ? "webgl2-fallback"
      : "webgl";
  return {rendererBackend};
};
