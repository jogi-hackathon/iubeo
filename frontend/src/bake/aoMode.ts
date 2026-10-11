import type {Object3D} from "three";

export type AOMode = "baked" | "realtime" | "both";

export const DEFAULT_AO_MODE: AOMode = "baked";

const AO_MODE_KEY = "aoMode";

export const aoModeUserData = (mode?: AOMode): Record<string, unknown> =>
  mode ? {[AO_MODE_KEY]: mode} : {};

export const aoModeOf = (obj: Object3D): AOMode => {
  for (let o: Object3D | null = obj; o; o = o.parent) {
    const mode = o.userData[AO_MODE_KEY] as AOMode | undefined;
    if (mode) {
      return mode;
    }
  }
  return DEFAULT_AO_MODE;
};

export const skipsGTAO = (modes: Iterable<AOMode>): boolean => {
  let any = false;
  for (const m of modes) {
    if (m !== "baked") {
      return false;
    }
    any = true;
  }
  return any;
};
