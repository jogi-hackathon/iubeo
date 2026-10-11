export const BAKED_AO_DIR = "ao";

export const SCENE_NAME_RE = /^[a-z0-9-]+$/i;

export const BAKE_SAVE_PATH = "/__bake/save";

export interface BakeSaveMeta {
  scene: string;
  atlasW: number;
  atlasH: number;
  layoutLength: number;
}

export const bakedAOFiles = (scene: string) => ({
  atlas: `${BAKED_AO_DIR}/${scene}.png`,
  layout: `${BAKED_AO_DIR}/${scene}.bin`,
});
