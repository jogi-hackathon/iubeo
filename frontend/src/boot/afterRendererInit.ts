import {assertWebGPUBackend} from "./capabilities";

/**
 * レンダラー生成(init)直後に1回呼ぶ。WebGL2 へフォールバックしていたら WebGPUUnavailableError を投げる。
 * TODO: compileAsync
 */
export const afterRendererInit = (renderer: object): void => {
  assertWebGPUBackend(renderer);
};
