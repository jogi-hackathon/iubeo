import type {Vector3Tuple} from "three";

import {SLIP_LENGTH} from "./strip";

const BODY_WIDTH = 0.078;
const BODY_HEIGHT = 0.16;
const BODY_DEPTH = 0.026;
const BODY_RADIUS = 0.006;
const BODY_TOP = BODY_HEIGHT / 2;

const PRINTER_HEIGHT = 0.038;
const PRINTER_DEPTH = 0.036;
const PRINTER_BOTTOM = BODY_TOP - PRINTER_HEIGHT;

const SLOT_WIDTH = 0.064;
const SLOT_HEIGHT = 0.0025;
const SLOT_DEPTH = 0.004;
const SLOT_Z = -0.002;

const SCREEN_BEZEL: [number, number] = [0.064, 0.044];
const SCREEN_INSET = 0.003;
const SCREEN_Y = PRINTER_BOTTOM - 0.004 - SCREEN_BEZEL[1] / 2;
const FRONT_Z = BODY_DEPTH / 2;
const BEZEL_DEPTH = 0.002;

const KEYPAD_SIZE: [number, number] = [0.06, 0.056];
const KEYPAD_Y = SCREEN_Y - SCREEN_BEZEL[1] / 2 - 0.006 - KEYPAD_SIZE[1] / 2;
const KEY_SIZE: Vector3Tuple = [0.014, 0.009, 0.002];
const KEY_COLUMNS = [-0.019, 0, 0.019];
const KEY_ROWS = [0.02, 0.007, -0.006, -0.019];

const GRIP_SIZE: Vector3Tuple = [0.004, 0.07, 0.02];
const GRIP_Y = -0.04;

const FEED_BUTTON: Vector3Tuple = [0.018, 0.006, 0.002];
const FEED_BUTTON_Y = PRINTER_BOTTOM + 0.012;

const ANTENNA_RADIUS = 0.0035;
const ANTENNA_HEIGHT = 0.014;

export type TerminalPartShape = "box" | "cylinder";
export type TerminalPartLook = "body" | "accent" | "key";

export type TerminalPart = {
  shape: TerminalPartShape;
  look: TerminalPartLook;
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
  radius?: number;
};

export const TERMINAL_PARTS: readonly TerminalPart[] = [
  {
    shape: "box",
    look: "body",
    position: [0, 0, 0],
    scale: [BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH],
    radius: BODY_RADIUS,
  },
  {
    shape: "box",
    look: "body",
    position: [0, BODY_TOP - PRINTER_HEIGHT / 2, 0],
    scale: [BODY_WIDTH, PRINTER_HEIGHT, PRINTER_DEPTH],
    radius: BODY_RADIUS,
  },
  {
    shape: "cylinder",
    look: "body",
    position: [0.03, BODY_TOP + ANTENNA_HEIGHT / 2 - 0.002, -0.011],
    scale: [ANTENNA_RADIUS, ANTENNA_HEIGHT, ANTENNA_RADIUS],
  },
  {
    shape: "box",
    look: "accent",
    position: [0, BODY_TOP, SLOT_Z],
    scale: [SLOT_WIDTH, SLOT_HEIGHT, SLOT_DEPTH],
  },
  {
    shape: "box",
    look: "accent",
    position: [0, FEED_BUTTON_Y, PRINTER_DEPTH / 2],
    scale: FEED_BUTTON,
  },
  {
    shape: "box",
    look: "accent",
    position: [0, SCREEN_Y, FRONT_Z],
    scale: [SCREEN_BEZEL[0], SCREEN_BEZEL[1], BEZEL_DEPTH],
  },
  {
    shape: "box",
    look: "accent",
    position: [0, KEYPAD_Y, FRONT_Z],
    scale: [KEYPAD_SIZE[0], KEYPAD_SIZE[1], BEZEL_DEPTH * 0.75],
  },
  ...KEY_ROWS.flatMap((dy) =>
    KEY_COLUMNS.map((x): TerminalPart => ({
      shape: "box",
      look: "key",
      position: [x, KEYPAD_Y + dy, FRONT_Z + BEZEL_DEPTH * 0.75],
      scale: KEY_SIZE,
    })),
  ),
  ...[-1, 1].map((sx): TerminalPart => ({
    shape: "box",
    look: "accent",
    position: [(sx * BODY_WIDTH) / 2, GRIP_Y, 0],
    scale: GRIP_SIZE,
  })),
];

export const TERMINAL_SCREEN = {
  width: SCREEN_BEZEL[0] - 2 * SCREEN_INSET,
  height: SCREEN_BEZEL[1] - 2 * SCREEN_INSET,
  position: [0, SCREEN_Y, FRONT_Z + BEZEL_DEPTH / 2 + 0.0003] as Vector3Tuple,
} as const;

export const SLIP_EXIT: Vector3Tuple = [0, BODY_TOP + SLOT_HEIGHT / 2, SLOT_Z];
export const PAPER_STUB = 0.006;

export const TERMINAL_OUTLINE = 0.0012;
export const TERMINAL_HELD_TILT = -0.42;

export const SLIP_LOOK = {
  center: [0, 0.05, 0.13] as Vector3Tuple,
  tilt: -0.37,
} as const;
export const TERMINAL_BELOW = {y: -0.3, tilt: -0.9} as const;

export const PRINT_STEPS = 24;
export const TEAR_TILT = 0.55;
export const PAPER_CURL = {printing: 1.1, rest: 0.22} as const;
export const PRINT_JITTER = 0.0004;

export const TERMINAL_STAGES = [
  "raise",
  "receive",
  "print",
  "feed",
  "tear",
  "look",
  "fly",
  "done",
] as const;
export type TerminalStage = (typeof TERMINAL_STAGES)[number];

export const STAGE_MS: Readonly<
  Record<Exclude<TerminalStage, "done">, number>
> = {
  raise: 450,
  receive: 450,
  print: 1800,
  feed: 250,
  tear: 350,
  look: 2700,
  fly: 900,
};
export const STOW_MS = 400;

const STAGE_START = (() => {
  const starts = {} as Record<TerminalStage, number>;
  let at = 0;
  for (const stage of TERMINAL_STAGES) {
    starts[stage] = at;
    if (stage !== "done") {
      at += STAGE_MS[stage];
    }
  }
  return starts;
})();

export const TERMINAL_SEQUENCE_MS = STAGE_START.done;
export const stageStart = (stage: TerminalStage): number => STAGE_START[stage];

export type TerminalPose = {
  stage: TerminalStage;
  progress: number;
  device: {y: number; z: number; tilt: number; jitter: number};
  paper: {
    length: number;
    curl: number;
    torn: boolean;
    toLook: number;
    tearTilt: number;
    launched: boolean;
  };
  screen: {status: ScreenStatus; progress: number};
};

export type ScreenStatus = "ready" | "receiving" | "printing" | "tear" | "done";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const stageAt = (
  elapsedMs: number,
): {stage: TerminalStage; progress: number} => {
  for (const stage of TERMINAL_STAGES) {
    if (stage === "done") {
      break;
    }
    const start = STAGE_START[stage];
    const ms = STAGE_MS[stage];
    if (elapsedMs < start + ms) {
      return {stage, progress: clamp01((elapsedMs - start) / ms)};
    }
  }
  return {stage: "done", progress: 1};
};

export const steppedFeed = (progress: number): number => {
  const p = clamp01(progress) * PRINT_STEPS;
  const line = Math.floor(p);
  if (line >= PRINT_STEPS) {
    return 1;
  }
  return (line + easeOutCubic(p - line)) / PRINT_STEPS;
};

const PRINT_START = STAGE_START.print;
const PRINT_END = STAGE_START.feed;
const TEAR_START = STAGE_START.tear;

const printedLength = (elapsedMs: number): number => {
  if (elapsedMs <= PRINT_START) {
    return PAPER_STUB;
  }
  const progress = (elapsedMs - PRINT_START) / (PRINT_END - PRINT_START);
  return lerp(PAPER_STUB, SLIP_LENGTH, steppedFeed(progress));
};

const screenOf = (
  stage: TerminalStage,
  progress: number,
  elapsedMs: number,
): TerminalPose["screen"] => {
  switch (stage) {
    case "raise":
      return {status: "ready", progress: 0};
    case "receive":
      return {status: "receiving", progress};
    case "print":
      return {
        status: "printing",
        progress:
          (printedLength(elapsedMs) - PAPER_STUB) / (SLIP_LENGTH - PAPER_STUB),
      };
    case "feed":
    case "tear":
      return {status: "tear", progress: 1};
    default:
      return {status: "done", progress: 1};
  }
};

export const terminalPose = (elapsedMs: number): TerminalPose => {
  const {stage, progress} = stageAt(elapsedMs);

  const raise = easeOutCubic(clamp01(elapsedMs / STAGE_MS.raise));
  const device = {
    y: lerp(TERMINAL_BELOW.y, 0, raise),
    z: 0,
    tilt: lerp(TERMINAL_BELOW.tilt, TERMINAL_HELD_TILT, raise),
    jitter: stage === "print" ? PRINT_JITTER : 0,
  };

  const torn = elapsedMs >= TEAR_START;
  const tear = torn ? clamp01((elapsedMs - TEAR_START) / STAGE_MS.tear) : 0;
  const settle = stage === "look" ? easeInOut(progress) : torn ? 1 : 0;
  const paper = {
    length: torn ? SLIP_LENGTH : printedLength(elapsedMs),
    curl: torn
      ? lerp(
          PAPER_CURL.printing,
          PAPER_CURL.rest,
          Math.max(easeInOut(tear) * 0.6, settle),
        )
      : PAPER_CURL.printing,
    torn,
    toLook: easeInOut(tear),
    tearTilt: TEAR_TILT * Math.sin(Math.PI * clamp01(tear / 0.55)),
    launched: stage === "fly" || stage === "done",
  };

  return {
    stage,
    progress,
    device,
    paper,
    screen: screenOf(stage, progress, elapsedMs),
  };
};
