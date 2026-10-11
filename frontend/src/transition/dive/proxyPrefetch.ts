import type {WebGPURenderer} from "three/webgpu";

import {loadAtlas} from "../../bake/atlasCache";
import {swapProxyAtlas} from "./proxyAO";

let renderer: WebGPURenderer | null = null;
const started = new Set<string>();

export const bindPrefetchRenderer = (next: WebGPURenderer | null): void => {
  renderer = next;
};

export const prefetchProxyAtlas = (name: "room" | "sandbox"): void => {
  if (started.has(name)) {
    return;
  }
  started.add(name);
  loadAtlas(name)
    .then((atlas) => {
      renderer?.initTexture(atlas);
      swapProxyAtlas(name, atlas);
    })
    .catch((e) => {
      started.delete(name);
      console.warn(`[proxyAO] ${name}: アトラスの先読みに失敗しました`, e);
    });
};
