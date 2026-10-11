import {useSyncExternalStore} from "react";

export type ToneMappingKind = "aces" | "agx" | "neutral" | "reinhard" | "none";

export const TONE_MAPPING_KINDS: readonly ToneMappingKind[] = [
  "aces",
  "agx",
  "neutral",
  "reinhard",
  "none",
];

export interface PostProcessSettings {
  enabled: boolean;
  exposure: number;
  toneMapping: ToneMappingKind;
  bloom: {
    enabled: boolean;
    strength: number;
    radius: number;
    threshold: number;
  };
  pixelate: {
    enabled: boolean;
    pixelSize: number;
  };
  skyNoise: {
    enabled: boolean;
    intensity: number;
    blockScale: number;
    elevationStart: number;
    elevationEnd: number;
    updateRate: number;
  };
  sea: {
    enabled: boolean;
    crest: number;
    amplitude: number;
    wavelengthScale: number;
    speed: number;
    cellSize: number;
  };
  vignette: {
    enabled: boolean;
    intensity: number;
    smoothness: number;
  };
  ao: {
    enabled: boolean;
    showOnly: boolean;
    denoise: boolean;
    radius: number;
    scale: number;
    thickness: number;
    samples: number;
    resolutionScale: number;
  };
  bakedAO: {
    enabled: boolean;
    intensity: number;
  };
}

export const DEFAULT_POSTPROCESS_SETTINGS: PostProcessSettings = {
  enabled: true,
  exposure: 1.2,
  toneMapping: "neutral",
  bloom: {enabled: true, strength: 0.5, radius: 0.4, threshold: 1},
  pixelate: {enabled: false, pixelSize: 4},
  skyNoise: {
    enabled: true,
    intensity: 1,
    blockScale: 1,
    elevationStart: 20,
    elevationEnd: 80,
    updateRate: 2,
  },
  sea: {
    enabled: true,
    crest: 0,
    amplitude: 3.5,
    wavelengthScale: 1,
    speed: 1,
    cellSize: 8,
  },
  vignette: {enabled: true, intensity: 0.25, smoothness: 0.6},
  ao: {
    enabled: true,
    showOnly: false,
    denoise: true,
    radius: 0.5,
    scale: 1,
    thickness: 1,
    samples: 16,
    resolutionScale: 0.5,
  },
  bakedAO: {enabled: true, intensity: 1},
};

/** vignette の smoothness の下限。0 だと smoothstep の edge0 == edge1 になる */
export const VIGNETTE_MIN_SMOOTHNESS = 0.01;

export type PostProcessPatch = {
  [K in keyof PostProcessSettings]?: PostProcessSettings[K] extends object
    ? Partial<PostProcessSettings[K]>
    : PostProcessSettings[K];
};

let settings: PostProcessSettings = DEFAULT_POSTPROCESS_SETTINGS;
const listeners = new Set<() => void>();

export const getPostProcessSettings = (): PostProcessSettings => settings;

const isGroup = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** 変更があったときだけ新しいオブジェクトに差し替えて購読者へ通知する(useSyncExternalStore の参照安定性のため) */
export const updatePostProcessSettings = (patch: PostProcessPatch): void => {
  const next: Record<string, unknown> = {...settings};
  let changed = false;
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const current = next[key];
    if (isGroup(current) && isGroup(value)) {
      const merged: Record<string, unknown> = {...current, ...value};
      if (Object.keys(merged).some((k) => merged[k] !== current[k])) {
        next[key] = merged;
        changed = true;
      }
    } else if (value !== undefined && current !== value) {
      next[key] = value;
      changed = true;
    }
  }
  if (!changed) {
    return;
  }
  settings = next as unknown as PostProcessSettings;
  for (const l of listeners) {
    l();
  }
};

export const resetPostProcessSettings = (): void => {
  if (settings === DEFAULT_POSTPROCESS_SETTINGS) {
    return;
  }
  settings = DEFAULT_POSTPROCESS_SETTINGS;
  for (const l of listeners) {
    l();
  }
};

export const subscribePostProcessSettings = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const usePostProcessSettings = (): PostProcessSettings =>
  useSyncExternalStore(subscribePostProcessSettings, getPostProcessSettings);
