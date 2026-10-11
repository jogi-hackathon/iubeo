import type {JsonValue} from "../../core/json";

export const LIGHTER_STAND_KIND = "lighter_stand";

export type LighterStandData = {
  hasLighter: boolean;
};

export const parseLighterStandData = (data: JsonValue): LighterStandData => {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {hasLighter: false};
  }
  return {hasLighter: data.hasLighter === true};
};

export const lighterIdOf = (standId: string): string =>
  standId.replace(/^lighter_stand-/, "lighter-");
