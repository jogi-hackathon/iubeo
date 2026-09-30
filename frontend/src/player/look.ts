import type {Look} from "./types";

/** マウス視点の感度(rad/px) */
export const LOOK_SENSITIVITY = 0.002;

/** 真上・真下で yaw が不定になるのを避けるための余裕(rad) */
const PITCH_EPSILON = 0.001;
const PITCH_LIMIT = Math.PI / 2 - PITCH_EPSILON;

/** マウス移動量(px)を向きに反映する。右(dx>0)で右へ、下(dy>0)で下へ向く */
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
