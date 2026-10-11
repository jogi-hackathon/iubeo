export type DivePhase =
  | "idle"
  | "fly"
  | "dive"
  | "portal"
  | "switch"
  | "return";

export type DiveFrame = {
  phase: DivePhase;
  d: number;
  blend: number;
  flyT: number;
  returnT: number;
  on: number;
  boot: number;
  crt: number;
  glitch: boolean;
  portalReached: boolean;
  done: boolean;
};

export type DiveOptions = {
  dCover: number;
  L: number;
  dStart?: number;
  dHold?: number;
};

export type DiveStepInput = {
  ready: boolean;
  returnDuration?: number;
};

export type DiveStartInput = {
  flyDistance: number;
  flyAngleDeg: number;
};

export const FLY_SKIP_DISTANCE = 0.02;
export const FLY_SKIP_ANGLE_DEG = 2;
export const DIVE_DURATION = 0.7;
export const HOLD_TAU = 1.5;
export const GLITCH_WAIT = 0.8;
export const GLITCH_INTERVAL = 1.5;
export const SWITCH_DURATION = 0.25;
export const MIN_BOOT_TIME = 0.3;
export const POWER_RATE = 14;
export const BOOT_RATE = 7;

const DEFAULT_D_START = 0.36;
const DEFAULT_D_HOLD = 0.03;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

const approach = (
  current: number,
  target: number,
  rate: number,
  dt: number,
): number => current + (target - current) * (1 - Math.exp(-rate * dt));

const easeInOut = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;

const smoothstep = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

export const RETURN_MIN_DISTANCE = 0.05;
export const RETURN_MIN_ANGLE_DEG = 2;

export const returnDurationOf = (distance: number, angleDeg: number): number =>
  distance <= RETURN_MIN_DISTANCE && angleDeg <= RETURN_MIN_ANGLE_DEG
    ? 0
    : Math.min(1.2, Math.max(0.35, 0.35 + 0.35 * distance + angleDeg / 360));

export const flyDuration = (distance: number): number =>
  Math.min(1.6, Math.max(0.5, 0.5 + 0.25 * distance));

export const createDiveMachine = (opts: DiveOptions) => {
  const dStart = opts.dStart ?? DEFAULT_D_START;
  const dHold = opts.dHold ?? DEFAULT_D_HOLD;
  const {dCover, L} = opts;

  let phase: DivePhase = "idle";
  let t = 0;
  let flyTime = 0;
  let d = dStart;
  let settleFrom = dHold;
  let portalReached = false;
  let nextGlitchAt = GLITCH_WAIT;
  let bootTime = 0;
  let power = 0;
  let raster = 0;
  let diveU = 0;
  let returnDuration = 0;

  const enter = (next: DivePhase) => {
    phase = next;
    t = 0;
  };

  const returnT = (): number =>
    phase === "return" ? easeInOut(clamp01(t / returnDuration)) : 0;

  const frame = (
    over: Partial<DiveFrame> & {blend: number; flyT: number},
  ): DiveFrame => ({
    phase,
    d,
    on: power + (1 - power) * diveU,
    boot: raster + (1 - raster) * diveU,
    crt: 1 - diveU,
    returnT: returnT(),
    glitch: false,
    portalReached,
    done: false,
    ...over,
  });

  const start = (input: DiveStartInput) => {
    d = dStart;
    portalReached = false;
    nextGlitchAt = GLITCH_WAIT;
    bootTime = 0;
    power = 0;
    raster = 0;
    diveU = 0;
    const skipFly =
      input.flyDistance <= FLY_SKIP_DISTANCE &&
      input.flyAngleDeg <= FLY_SKIP_ANGLE_DEG;
    flyTime = flyDuration(input.flyDistance);
    enter(skipFly ? "dive" : "fly");
  };

  const finish = (over: Partial<DiveFrame>): DiveFrame => {
    const last = frame({blend: 0, flyT: 1, done: true, ...over});
    phase = "idle";
    return last;
  };

  const step = (
    dt: number,
    {ready, returnDuration: nextReturn = 0}: DiveStepInput,
  ): DiveFrame => {
    if (phase !== "idle") {
      bootTime += dt;
      power = approach(power, 1, POWER_RATE, dt);
      raster = approach(raster, 1, BOOT_RATE, dt);
    }
    switch (phase) {
      case "idle":
        return frame({blend: 0, flyT: 1});
      case "fly": {
        t += dt;
        if (t >= flyTime) {
          enter("dive");
          return frame({blend: 0, flyT: 1});
        }
        return frame({blend: 0, flyT: smoothstep(t / flyTime)});
      }
      case "dive": {
        if (bootTime < MIN_BOOT_TIME) {
          return frame({blend: 0, flyT: 1});
        }
        t += dt;
        const u = clamp01(t / DIVE_DURATION);
        d = dStart + (dCover - dStart) * u * u;
        diveU = u;
        if (u >= 1) {
          d = dCover;
          portalReached = true;
          enter("portal");
          return frame({blend: 1, flyT: 1});
        }
        return frame({blend: 0, flyT: 1});
      }
      case "portal": {
        t += dt;
        let glitch = false;
        if (ready) {
          settleFrom = d;
          enter("switch");
          return frame({blend: 1, flyT: 1, glitch: true});
        }
        d = dHold + (dCover - dHold) * Math.exp(-t / HOLD_TAU);
        if (d < dHold) {
          d = dHold;
        }
        if (t >= nextGlitchAt) {
          glitch = true;
          nextGlitchAt += GLITCH_INTERVAL;
        }
        return frame({blend: 1, flyT: 1, glitch});
      }
      case "switch": {
        t += dt;
        const u = clamp01(t / SWITCH_DURATION);
        const e = 1 - (1 - u) * (1 - u) * (1 - u);
        d = settleFrom + (-L - settleFrom) * e;
        if (u >= 1) {
          d = -L;
          if (nextReturn <= 0) {
            return finish({});
          }
          returnDuration = nextReturn;
          enter("return");
          return frame({blend: 0, flyT: 1});
        }
        return frame({blend: 1 - u, flyT: 1});
      }
      case "return": {
        t += dt;
        if (t >= returnDuration) {
          return finish({returnT: 1});
        }
        return frame({blend: 0, flyT: 1});
      }
    }
  };

  return {
    start,
    step,
    get phase(): DivePhase {
      return phase;
    },
  };
};

export type DiveMachine = ReturnType<typeof createDiveMachine>;
