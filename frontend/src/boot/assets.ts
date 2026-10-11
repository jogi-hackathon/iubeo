export type Assets = Record<string, never>;

export type AssetProgress = (ratio: number) => void;

export const loadAssets = async (
  _onProgress?: AssetProgress,
): Promise<Assets> => ({});
