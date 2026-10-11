import {storageManager} from "./storage";

export interface GraphicsSettings {
  resolutionScale: number;
  fpsLimit: number | null;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
const MIN_FPS_LIMIT = 20;

const DEFAULTS: GraphicsSettings = {resolutionScale: 0.75, fpsLimit: 60};

export const parseGraphicsSettings = (raw: unknown): GraphicsSettings => {
  if (typeof raw !== "object" || raw === null) {
    return DEFAULTS;
  }
  const {resolutionScale, fpsLimit} = raw as Record<string, unknown>;
  return {
    resolutionScale:
      typeof resolutionScale === "number" && Number.isFinite(resolutionScale)
        ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, resolutionScale))
        : DEFAULTS.resolutionScale,
    fpsLimit:
      typeof fpsLimit === "number" && Number.isFinite(fpsLimit) && fpsLimit > 0
        ? Math.max(MIN_FPS_LIMIT, fpsLimit)
        : DEFAULTS.fpsLimit,
  };
};

export const graphicsStore = storageManager.defineStore<GraphicsSettings>({
  key: "graphics",
  defaults: DEFAULTS,
  parse: parseGraphicsSettings,
});

/**
 * Canvas(ドローイングバッファ)の DPR。1 以下の resolutionScale は Canvas ではなくシーンの内部解像度(getRenderScale)で
 * 落とし、ポストプロセスが FSR1 で画面の解像度へ上げる。1 を超える分(スーパーサンプリング)だけ Canvas を大きくする
 */
export const getDpr = (settings: GraphicsSettings): number =>
  Math.max(1, settings.resolutionScale) * window.devicePixelRatio;

/** シーン(と AO・ブルーム)を描く内部解像度の、画面に対する比率(0〜1) */
export const getRenderScale = (settings: GraphicsSettings): number =>
  Math.min(1, settings.resolutionScale);
