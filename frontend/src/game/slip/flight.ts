import {STAGE_MS} from "./terminal";

export const SLIP_FLY_MS = STAGE_MS.fly;
export const FLY_ARC = 0.35;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => t * t * (3 - 2 * t);

export const slipFlight = (t: number): {position: number; lift: number} => {
  const u = clamp01(t);
  return {position: easeInOut(u), lift: Math.sin(Math.PI * u)};
};
