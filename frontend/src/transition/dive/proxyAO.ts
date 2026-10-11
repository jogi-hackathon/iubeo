import type {Mesh, Scene, Texture} from "three";

import {
  createPlaceholderAtlas,
  loadAtlas,
  loadLayout,
  peekAtlas,
} from "../../bake/atlasCache";
import {applyBakedAtlas, syncIntensity} from "../../bake/BakedAO";
import {selectBakeMeshes} from "../../bake/meshes";
import {
  getPostProcessSettings,
  subscribePostProcessSettings,
} from "../../camera/postprocess/settings";

type Applied = ReturnType<typeof applyBakedAtlas>;

let placeholder: Texture | null = null;
const swappers = new Map<string, (atlas: Texture) => void>();

const placeholderAtlas = (): Texture => {
  placeholder ??= createPlaceholderAtlas();
  return placeholder;
};

export const swapProxyAtlas = (name: string, atlas: Texture): void => {
  swappers.get(name)?.(atlas);
};

export const collectMeshes = (scene: Scene): Mesh[] => {
  const out: Mesh[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if ((o as Mesh).isMesh) {
      out.push(o as Mesh);
    }
  });
  return out;
};

export const attachProxyAO = async (
  scene: Scene,
  name: string,
  options: {eagerAtlas: boolean},
): Promise<void> => {
  try {
    const layout = await loadLayout(name);
    if (!layout) {
      return;
    }
    if (options.eagerAtlas) {
      await loadAtlas(name);
    }
    let atlas = peekAtlas(name) ?? placeholderAtlas();
    const meshes = selectBakeMeshes(collectMeshes(scene));
    let applied: Extract<Applied, {undo: () => void}> | null = null;

    const apply = () => {
      if (applied) {
        applied.undo();
        applied = null;
      }
      if (!getPostProcessSettings().bakedAO.enabled) {
        return;
      }
      atlas = peekAtlas(name) ?? atlas;
      const result = applyBakedAtlas(meshes, scene, layout, atlas);
      if ("mismatch" in result) {
        console.warn(
          `[proxyAO] ${name}: ベイク結果と偽物シーンが合わないので AO なしで描きます: ${result.mismatch}`,
        );
        return;
      }
      applied = result;
      syncIntensity(result.materials);
    };

    swappers.set(name, (next) => {
      atlas = next;
      if (applied) {
        for (const material of applied.materials) {
          material.aoMap = next;
        }
      }
    });

    let enabled = getPostProcessSettings().bakedAO.enabled;
    subscribePostProcessSettings(() => {
      const next = getPostProcessSettings().bakedAO.enabled;
      if (next !== enabled) {
        enabled = next;
        apply();
      } else if (applied) {
        syncIntensity(applied.materials);
      }
    });
    apply();
  } catch (e) {
    console.warn(`[proxyAO] ${name}: 読み込みに失敗しました`, e);
  }
};
