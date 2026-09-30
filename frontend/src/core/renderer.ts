import {WebGPURenderer} from "three/webgpu";

import {afterRendererInit} from "../boot/afterRendererInit";
import {DEBUG_AVAILABLE} from "./debug/flags";

/** VITE_RENDERER=webgl のときは WebGL2 バックエンドを強制する。非対応なので、フォールバック時のエラー画面の確認に使う */
const FORCE_WEBGL = import.meta.env.VITE_RENDERER === "webgl";

/**
 * Canvas の gl に渡すファクトリ。WebGPU のみ対応で、WebGL2 へフォールバックしたら dispose して投げる
 * (R3F は reject を Canvas 内で throw し直すので、上位の BootErrorBoundary が受ける)
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
