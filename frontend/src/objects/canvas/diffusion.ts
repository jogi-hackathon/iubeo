import {CANVAS_ACTION_MS} from "./data";

export const APPEAR_SECONDS = 0.25;
export const VANISH_SECONDS = 0.4;
const FINISH_HOLD_SECONDS = 0.15;

const DENOISE_START = APPEAR_SECONDS;
const DENOISE_SECONDS =
  CANVAS_ACTION_MS / 1000 - APPEAR_SECONDS - FINISH_HOLD_SECONDS;

export const denoiseProgress = (elapsed: number): number =>
  Math.min(1, Math.max(0, (elapsed - DENOISE_START) / DENOISE_SECONDS));

export const stepAppear = (
  appear: number,
  working: boolean,
  dt: number,
): number => (working ? Math.min(1, appear + dt / APPEAR_SECONDS) : appear);

export const stepFade = (fade: number, working: boolean, dt: number): number =>
  working ? 1 : Math.max(0, fade - dt / VANISH_SECONDS);
