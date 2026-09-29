/** 起動時に読み込むアセット(テクスチャ・メッシュなど)。現状は読み込み対象なし */
export type Assets = Record<string, never>;

/** アセット読み込みの進捗(0〜1)。three の LoadingManager.onProgress から呼ぶ想定 */
export type AssetProgress = (ratio: number) => void;

export const loadAssets = async (
  _onProgress?: AssetProgress,
): Promise<Assets> => ({});
