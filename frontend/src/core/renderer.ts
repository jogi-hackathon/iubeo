import {WebGLRenderer} from "three";
import {WebGPURenderer} from "three/webgpu";

import {afterRendererInit} from "../boot/afterRendererInit";
import type {AppContext} from "../boot/context";
import {DEBUG_AVAILABLE} from "./debug/flags";

/**
 * Canvas の gl に渡すファクトリを作る。バックエンドは ctx.capabilities.rendererBackend の予定値に従い、
 * WebGPU が使えないと判定済みなら forceWebGL で WebGPURenderer 内部の二重の初期化試行を避ける
 */
export const createRenderer = (ctx: AppContext) => async (props: object) => {
  const {rendererBackend} = ctx.capabilities;
  if (rendererBackend === "webgl") {
    const renderer = new WebGLRenderer(
      props as ConstructorParameters<typeof WebGLRenderer>[0],
    );
    afterRendererInit(renderer, ctx);
    return renderer;
  }
  const renderer = new WebGPURenderer({
    ...(props as ConstructorParameters<typeof WebGPURenderer>[0]),
    forceWebGL: rendererBackend === "webgl2-fallback",
    trackTimestamp: DEBUG_AVAILABLE,
  });
  await renderer.init();
  afterRendererInit(renderer, ctx);
  return renderer;
};
