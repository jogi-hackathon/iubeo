import type {Vector3Tuple} from "three";

export const WORLD_LIGHT = {
  hemisphere: {sky: "#ffffff", ground: "#b8b8b8", intensity: 1.8},
  sun: {color: "#ffffff", intensity: 1.4, position: [8, 10, 5] as Vector3Tuple},
} as const;
