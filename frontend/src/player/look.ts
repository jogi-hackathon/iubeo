import type {Look} from "./types";

export const LOOK_SENSITIVITY = 0.002;

const PITCH_EPSILON = 0.001;
const PITCH_LIMIT = Math.PI / 2 - PITCH_EPSILON;

export const applyLook = <T extends Look>(
  state: T,
  dx: number,
  dy: number,
): T => {
  state.yaw -= dx * LOOK_SENSITIVITY;
  state.pitch = Math.max(
    -PITCH_LIMIT,
    Math.min(PITCH_LIMIT, state.pitch - dy * LOOK_SENSITIVITY),
  );
  return state;
};
