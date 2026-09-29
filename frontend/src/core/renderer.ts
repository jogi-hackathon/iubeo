import { WebGLRenderer } from "three";
import { WebGPURenderer } from "three/webgpu";
import { DEBUG_AVAILABLE } from "./debug/flags";

const USE_WEBGPU = (import.meta.env.VITE_RENDERER ?? "webgpu") === "webgpu";

/** WebGPU 非対応環境では WebGPURenderer が WebGL2 バックエンドへ自動フォールバックする */
export const createRenderer = async (props: object) => {
  if (USE_WEBGPU) {
    const renderer = new WebGPURenderer({
      ...(props as ConstructorParameters<typeof WebGPURenderer>[0]),
      trackTimestamp: DEBUG_AVAILABLE,
    });
    await renderer.init();
    return renderer;
  }
  return new WebGLRenderer(
    props as ConstructorParameters<typeof WebGLRenderer>[0],
  );
};
