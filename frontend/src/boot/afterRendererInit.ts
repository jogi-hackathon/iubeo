import type { AppContext } from "./context";

/** WebGPURenderer / WebGLRenderer の差を吸収して読む項目だけを型付けする */
interface RendererLike {
  isWebGLRenderer?: boolean;
  backend?: { isWebGPUBackend?: boolean };
}

/**
 * レンダラー生成(init)直後に1回呼ぶ。実際のバックエンドを capabilities に反映して確定させる。
 * TODO: ここでディスプレイ HDR の最終確定・ポストプロセス構築・compileAsync も行う
 */
export const afterRendererInit = (renderer: object, ctx: AppContext): void => {
  const r = renderer as RendererLike;
  ctx.capabilities.rendererBackend = r.isWebGLRenderer
    ? "webgl"
    : r.backend?.isWebGPUBackend
      ? "webgpu"
      : "webgl2-fallback";
};
