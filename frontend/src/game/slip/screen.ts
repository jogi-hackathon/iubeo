import {PRINT_STEPS, type ScreenStatus} from "./terminal";

export const SCREEN_CANVAS = {width: 288, height: 189} as const;

const MONO = '"Menlo", "SF Mono", "Consolas", "Hiragino Sans", monospace';
const BG = "#1b1b1b";
const FRAME = "#4a4a4a";
const TEXT = "#e6e6e6";
const DIM = "#8a8a8a";
const BAR_WIDTH = 10;
const FONT_SIZE = 14;
const LINE_HEIGHT = 20;
const LEFT = 12;
const BOX_PAD = 6;

export const SPINNER = ["·", "✢", "✳", "✶", "✻", "✽"] as const;

export type ScreenFrame = {
  status: ScreenStatus;
  progress: number;
  tick: number;
};

const SPINNING: ReadonlySet<ScreenStatus> = new Set(["receiving"]);
const BLINKING: ReadonlySet<ScreenStatus> = new Set(["ready", "tear", "done"]);

export const screenKey = ({status, progress, tick}: ScreenFrame): string => {
  const lines = status === "printing" ? Math.round(progress * PRINT_STEPS) : 0;
  const motion = SPINNING.has(status)
    ? tick % SPINNER.length
    : BLINKING.has(status)
      ? Math.floor(tick / 2) % 2
      : 0;
  return `${status}:${lines}:${motion}`;
};

type Span = {text: string; color?: string};
type Line = readonly Span[];
type Row = {spans: Line; box?: boolean};

const row = (spans: Line, box = false): Row => ({spans, box});

const welcome = (): Row[] => [
  row([{text: "✻ "}, {text: "Welcome to IUBEO"}], true),
  row([]),
];

const tool = (result: Line): Row[] => [
  row([{text: "⏺ "}, {text: "Print"}, {text: "(order-slip)", color: DIM}]),
  row([{text: "  ⎿  ", color: DIM}, ...result]),
];

const bar = (progress: number): string => {
  const filled = Math.round(progress * BAR_WIDTH);
  return "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
};

const prompt = (hint: string, cursor: boolean): Line => [
  {text: "> ", color: DIM},
  {text: hint},
  {text: cursor ? "▌" : " ", color: TEXT},
];

const rowsOf = ({status, progress, tick}: ScreenFrame): Row[] => {
  const spin = SPINNER[tick % SPINNER.length]!;
  const cursor = Math.floor(tick / 2) % 2 === 0;
  switch (status) {
    case "ready":
      return [...welcome(), row(prompt("", cursor))];
    case "receiving":
      return [
        ...welcome(),
        row([{text: `${spin} `}, {text: "Receiving order…"}]),
        row([{text: "  (esc to interrupt)", color: DIM}]),
      ];
    case "printing": {
      const lines = Math.round(progress * PRINT_STEPS);
      return tool([
        {text: `${bar(progress)} `},
        {text: `${lines}/${PRINT_STEPS} lines`, color: DIM},
      ]);
    }
    case "tear":
      return [
        ...tool([{text: `Done (${PRINT_STEPS} lines)`, color: DIM}]),
        row([]),
        row(prompt("千切ってください", cursor)),
      ];
    default:
      return [
        ...tool([{text: `Done (${PRINT_STEPS} lines)`, color: DIM}]),
        row([]),
        row(prompt("ワークスペースへ", cursor)),
      ];
  }
};

export const paintScreen = (
  canvas: HTMLCanvasElement,
  frame: ScreenFrame,
): void => {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const {width: w, height: h} = canvas;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = FRAME;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  ctx.font = `${FONT_SIZE}px ${MONO}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let y = 22;
  for (const {spans, box} of rowsOf(frame)) {
    let x = LEFT + (box ? BOX_PAD : 0);
    for (const span of spans) {
      ctx.fillStyle = span.color ?? TEXT;
      ctx.fillText(span.text, x, y);
      x += ctx.measureText(span.text).width;
    }
    if (box) {
      ctx.strokeStyle = DIM;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(
        LEFT,
        y - LINE_HEIGHT / 2 - 2,
        x - LEFT + BOX_PAD,
        LINE_HEIGHT + 4,
        4,
      );
      ctx.stroke();
    }
    y += LINE_HEIGHT;
  }

  ctx.fillStyle = DIM;
  ctx.font = `11px ${MONO}`;
  ctx.textAlign = "right";
  ctx.fillText("? for shortcuts", w - 12, h - 14);
  ctx.textAlign = "left";
  ctx.fillText("iubeo · order", 12, h - 14);
};
