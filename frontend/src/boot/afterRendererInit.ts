import {assertWebGPUBackend} from "./capabilities";

export const afterRendererInit = (renderer: object): void => {
  assertWebGPUBackend(renderer);
};
