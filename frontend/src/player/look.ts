import type {Look} from "./types";

export const LOOK_SENSITIVITY = 0.002;

const PITCH_EPSILON = 0.001;
const PITCH_LIMIT = Math.PI / 2 - PITCH_EPSILON;

/** scale は設定の感度の倍率(core/input/mouseSettings) */
export const applyLook = <T extends Look>(
  state: T,
  dx: number,
  dy: number,
  scale = 1,
): T => {
  const k = LOOK_SENSITIVITY * scale;
  state.yaw -= dx * k;
  state.pitch = Math.max(
    -PITCH_LIMIT,
    Math.min(PITCH_LIMIT, state.pitch - dy * k),
  );
  return state;
};
