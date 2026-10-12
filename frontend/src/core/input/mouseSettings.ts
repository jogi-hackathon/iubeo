import {storageManager} from "../storage";

/** マウスの設定。sensitivity はマウスの速さの倍率。一人称で見回すときと、PC・俯瞰ビューのカーソルに掛かる(1 が既定) */
export interface MouseSettings {
  sensitivity: number;
}

export const MIN_SENSITIVITY = 0.2;
export const MAX_SENSITIVITY = 3;

const DEFAULTS: MouseSettings = {sensitivity: 1};

export const parseMouseSettings = (raw: unknown): MouseSettings => {
  if (typeof raw !== "object" || raw === null) {
    return DEFAULTS;
  }
  const {sensitivity} = raw as Record<string, unknown>;
  return {
    sensitivity:
      typeof sensitivity === "number" && Number.isFinite(sensitivity)
        ? Math.min(MAX_SENSITIVITY, Math.max(MIN_SENSITIVITY, sensitivity))
        : DEFAULTS.sensitivity,
  };
};

export const mouseSettingsStore = storageManager.defineStore<MouseSettings>({
  key: "mouse",
  defaults: DEFAULTS,
  parse: parseMouseSettings,
});
