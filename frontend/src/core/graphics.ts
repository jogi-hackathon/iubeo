import {storageManager} from "./storage";

export interface GraphicsSettings {
  resolutionScale: number;
  fpsLimit: number | null;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
const MIN_FPS_LIMIT = 20;

const DEFAULTS: GraphicsSettings = {resolutionScale: 0.5, fpsLimit: 60};

export const RESOLUTION_SCALE_CHOICES = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;
export const FPS_LIMIT_CHOICES = [30, 60, 120, 144, null] as const;

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
      fpsLimit === null
        ? null
        : typeof fpsLimit === "number" &&
            Number.isFinite(fpsLimit) &&
            fpsLimit > 0
          ? Math.max(MIN_FPS_LIMIT, fpsLimit)
          : DEFAULTS.fpsLimit,
  };
};

export const graphicsStore = storageManager.defineStore<GraphicsSettings>({
  key: "graphics",
  defaults: DEFAULTS,
  parse: parseGraphicsSettings,
});

export const getDpr = (settings: GraphicsSettings): number =>
  Math.max(1, settings.resolutionScale) * window.devicePixelRatio;

export const getRenderScale = (settings: GraphicsSettings): number =>
  Math.min(1, settings.resolutionScale);
