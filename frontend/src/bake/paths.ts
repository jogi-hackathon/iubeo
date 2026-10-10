/** ベイク結果の置き場所(public/ 以下)。git にコミットする */
export const BAKED_AO_DIR = "ao";

/** シーン名はファイル名になるので英数字とハイフンに限る */
export const SCENE_NAME_RE = /^[a-z0-9-]+$/i;

/** ベイクページが結果を POST する dev サーバーのパス(scripts/bakeSavePlugin.ts) */
export const BAKE_SAVE_PATH = "/__bake/save";

/** ベイクページが X-Bake-Meta ヘッダで送るメタ情報 */
export interface BakeSaveMeta {
  scene: string;
  atlasW: number;
  atlasH: number;
  /** body 末尾のレイアウト(format.ts の serializeLayout)のバイト数 */
  layoutLength: number;
}

/** public/ からの相対パス */
export const bakedAOFiles = (scene: string) => ({
  atlas: `${BAKED_AO_DIR}/${scene}.png`,
  layout: `${BAKED_AO_DIR}/${scene}.bin`,
});
