export interface GraphicsSettings {
  resolutionScale: number;
  fpsLimit: number | null;
}

const STORAGE_KEY = "iubeo:graphics";
const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
/** これ未満だと MAX_DELTA でクランプされスローモーションになる */
const MIN_FPS_LIMIT = 20;

const DEFAULTS: GraphicsSettings = { resolutionScale: 1, fpsLimit: null };

/** 起動シーケンス(boot)の settings ステップから1回だけ呼ぶ */
export const loadGraphicsSettings = (): GraphicsSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // 手動で編集しやすいよう、未設定なら既定値を書き込んでおく
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS));
      return DEFAULTS;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULTS;
    const { resolutionScale, fpsLimit } = parsed as Record<string, unknown>;
    return {
      resolutionScale:
        typeof resolutionScale === "number" && Number.isFinite(resolutionScale)
          ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, resolutionScale))
          : DEFAULTS.resolutionScale,
      fpsLimit:
        typeof fpsLimit === "number" &&
        Number.isFinite(fpsLimit) &&
        fpsLimit > 0
          ? Math.max(MIN_FPS_LIMIT, fpsLimit)
          : DEFAULTS.fpsLimit,
    };
  } catch {
    return DEFAULTS;
  }
};

export const getDpr = (settings: GraphicsSettings): number =>
  settings.resolutionScale * window.devicePixelRatio;
