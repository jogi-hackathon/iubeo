import {assertWebGPUBackend} from "./capabilities";

/**
 * レンダラー生成(init)直後に1回呼ぶ。WebGL2 へフォールバックしていたら WebGPUUnavailableError を投げる。
 * シェーダーの事前コンパイルはシーンが揃ってから Canvas 内で行う(core/ShaderWarmup)
 */
export const afterRendererInit = (renderer: object): void => {
  assertWebGPUBackend(renderer);
};
