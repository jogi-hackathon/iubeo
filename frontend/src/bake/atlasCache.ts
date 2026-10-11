import {
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  type Texture,
  TextureLoader,
  UnsignedByteType,
} from "three";

import {type BakedAOLayout, parseLayout} from "./format";
import {bakedAOFiles} from "./paths";

export interface BakedAOData {
  layout: BakedAOLayout;
  atlas: Texture;
}

const configureAtlas = <T extends Texture>(texture: T): T => {
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.channel = 1;
  return texture;
};

const fetchAtlas = async (scene: string): Promise<Texture> => {
  const url = `${import.meta.env.BASE_URL}${bakedAOFiles(scene).atlas}`;
  return configureAtlas(await new TextureLoader().loadAsync(url));
};

const fetchLayout = async (scene: string): Promise<BakedAOLayout | null> => {
  const url = `${import.meta.env.BASE_URL}${bakedAOFiles(scene).layout}`;
  const res = await fetch(url);
  if (!res.ok || res.headers.get("content-type")?.startsWith("text/html")) {
    return null;
  }
  return parseLayout(await res.arrayBuffer());
};

const layouts = new Map<string, Promise<BakedAOLayout | null>>();
const atlases = new Map<string, Promise<Texture>>();
const loadedAtlases = new Map<string, Texture>();

export const loadLayout = (scene: string): Promise<BakedAOLayout | null> => {
  let cached = layouts.get(scene);
  if (cached === undefined) {
    cached = fetchLayout(scene);
    cached.catch(() => {
      layouts.delete(scene);
    });
    layouts.set(scene, cached);
  }
  return cached;
};

export const loadAtlas = (scene: string): Promise<Texture> => {
  let cached = atlases.get(scene);
  if (cached === undefined) {
    cached = fetchAtlas(scene).then((texture) => {
      loadedAtlases.set(scene, texture);
      return texture;
    });
    cached.catch(() => {
      atlases.delete(scene);
    });
    atlases.set(scene, cached);
  }
  return cached;
};

export const peekAtlas = (scene: string): Texture | null =>
  loadedAtlases.get(scene) ?? null;

export const createPlaceholderAtlas = (): Texture => {
  const texture = new DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    RGBAFormat,
    UnsignedByteType,
  );
  configureAtlas(texture);
  texture.needsUpdate = true;
  return texture;
};

export const loadBakedAO = async (
  scene: string,
): Promise<BakedAOData | null> => {
  const atlasPromise = loadAtlas(scene);
  atlasPromise.catch(() => {});
  const layout = await loadLayout(scene);
  if (!layout) {
    return null;
  }
  return {layout, atlas: await atlasPromise};
};
