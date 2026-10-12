import {WebGPURenderer} from "three/webgpu";

import {afterRendererInit} from "../boot/afterRendererInit";
import {DEBUG_AVAILABLE} from "./debug/flags";

const FORCE_WEBGL = import.meta.env.VITE_RENDERER === "webgl";

/**
 * R3F は gl ファクトリの reject を Canvas 内で throw し直すので、上位の BootErrorBoundary が受ける
 */
export const createRenderer = async (props: object) => {
  const renderer = new WebGPURenderer({
    ...(props as ConstructorParameters<typeof WebGPURenderer>[0]),
    forceWebGL: FORCE_WEBGL,
    trackTimestamp: DEBUG_AVAILABLE,
  });
  await renderer.init();
  try {
    afterRendererInit(renderer);
  } catch (e) {
    renderer.dispose();
    throw e;
  }
  return renderer;
};
