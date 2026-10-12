import type {Vector3Tuple} from "three";

import {SLIP_LENGTH} from "./strip";

/**
 * ハンディーターミナル(伝票のプリンタ付き)の寸法と部品。手に持つ座標系(手首の中点が原点、-Z が前)に置く。
 * 画面と鍵盤は +Z(目の側)を向き、紙は上面のスロットから +Y へ出る
 */
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
/** body: 白い塗りに縁取り / accent: 暗い塗り / key: 白い塗りで縁取り無し */
export type TerminalPartLook = "body" | "accent" | "key";

export type TerminalPart = {
  shape: TerminalPartShape;
  look: TerminalPartLook;
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
  /** 角の丸み(box のみ) */
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

/** 画面(表示面)の大きさと位置。ベゼルの内側に置く */
export const TERMINAL_SCREEN = {
  width: SCREEN_BEZEL[0] - 2 * SCREEN_INSET,
  height: SCREEN_BEZEL[1] - 2 * SCREEN_INSET,
  position: [0, SCREEN_Y, FRONT_Z + BEZEL_DEPTH / 2 + 0.0003] as Vector3Tuple,
} as const;

/** 紙が出てくる位置(端末のローカル座標)。ここから +Y へ出る */
export const SLIP_EXIT: Vector3Tuple = [0, BODY_TOP + SLOT_HEIGHT / 2, SLOT_Z];
/** 千切ったあとにスロットに残る紙の長さ */
export const PAPER_STUB = 0.006;

export const TERMINAL_OUTLINE = 0.0012;
/** 手に持ったときの傾き(画面が目を向く) */
export const TERMINAL_HELD_TILT = -0.42;

/** 千切った伝票を見る位置(手の座標系)。伝票の中心と、目を向く傾き */
export const SLIP_LOOK = {
  center: [0, 0.05, 0.13] as Vector3Tuple,
  tilt: -0.37,
} as const;
/** 持ち上げる前(視界の下)の位置と傾き */
export const TERMINAL_BELOW = {y: -0.3, tilt: -0.9} as const;

/** 印刷の行送りの回数。1 行ずつ送るので動きがコマ送りになる */
export const PRINT_STEPS = 24;
/** 千切るときに手前へ折る角度 */
export const TEAR_TILT = 0.55;
/** 印刷中に紙が手前(+Z)へ巻く強さと、千切ったあとに残る巻き */
export const PAPER_CURL = {printing: 1.1, rest: 0.22} as const;
/** 印刷中の端末の震え(m) */
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

/** 各段の長さ(ms)。順に再生する */
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
/** 飛ぶ段のうち、視線を元へ戻し終えるまでの時間(ms)。残りは伝票が飛んでいる */
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
  /** 段の中の進み(0..1)。done は 1 */
  progress: number;
  device: {y: number; z: number; tilt: number; jitter: number};
  paper: {
    /** スロットから出ている紙の長さ(m) */
    length: number;
    curl: number;
    /** 千切れて端末から離れているか */
    torn: boolean;
    /** 千切って見る位置へ向かう進み(0..1) */
    toLook: number;
    /** 千切るときに手前へ折る角度 */
    tearTilt: number;
    /** 伝票が手を離れてワークスペースへ飛んでいるか(手元の伝票は隠す) */
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

/** 行送り: 1 行ごとに素早く送って止まる、を PRINT_STEPS 回。全体では 0 → 1 */
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

/**
 * 依頼が届いてからの経過時間(ms)で、端末と紙の姿勢を返す。
 * 持ち上げ → 受信 → 印刷(行送り) → 送り出し → 千切る → 見る → 飛ぶ、の順に自動で進む
 */
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
