export type Line = {y: number; height: number; color: string; shaded: boolean};
export type Word = {line: number; x0: number; x1: number; height: number};
export type Beat = {at: number; line: number; x: number};
export type WritingScript = {
  lines: readonly Line[];
  words: readonly Word[];
  beats: readonly Beat[];
};

export const PAGE = {
  width: 1024,
  height: 1448,
  margin: 80,
} as const;

const TITLE = {height: 44, color: "#4a4a4f", after: 34} as const;
const META = {height: 14, color: "#c7c7cc", after: 56} as const;
const HEADING = {height: 26, color: "#6e6e73", after: 38} as const;
const BODY = {height: 16, color: "#aeaeb2", pitch: 32} as const;
const CODE = {height: 14, color: "#8e8e93", pitch: 28, indent: 24} as const;
const SECTION_GAP = 42;
const WORD_GAP = 14;
const BULLET_SIZE = 10;
const BULLET_INDENT = 32;
const CODE_PADDING = 18;
const CODE_SHADE = "#f2f2f4";

const WORD_WIDTH = [36, 120] as const;
const CODE_WORD_WIDTH = [20, 90] as const;
const CHUNK_WORDS = [0.4, 3] as const;
const PAUSE_CHANCE = 0.12;
const PAUSE_MS = [150, 400] as const;
const FLOW_MS = [25, 70] as const;

const mulberry32 = (seed: number) => (): number => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const layoutPage = (random: () => number) => {
  const between = ([lo, hi]: readonly [number, number]) =>
    lo + (hi - lo) * random();
  const count = ([lo, hi]: readonly [number, number]) =>
    Math.floor(between([lo, hi + 1]));
  const left = PAGE.margin;
  const right = PAGE.width - PAGE.margin;
  const bottom = PAGE.height - PAGE.margin;

  const lines: Line[] = [];
  const words: Word[] = [];
  let y = PAGE.margin;

  const addLine = (
    style: {height: number; color: string},
    shaded = false,
  ): number => {
    lines.push({
      y: y + style.height / 2,
      height: style.height,
      color: style.color,
      shaded,
    });
    return lines.length - 1;
  };
  const fillWords = (
    line: number,
    from: number,
    to: number,
    widths: readonly [number, number],
  ) => {
    let x = from;
    for (;;) {
      const width = between(widths);
      if (x + width > to) {
        return;
      }
      words.push({line, x0: x, x1: x + width, height: lines[line]!.height});
      x += width + WORD_GAP;
    }
  };
  const ragged = (last: boolean) =>
    last ? left + between([0.3, 0.75]) * (right - left) : right;

  const title = addLine(TITLE);
  words.push({
    line: title,
    x0: left,
    x1: left + between([0.4, 0.65]) * (right - left),
    height: TITLE.height,
  });
  y += TITLE.height + TITLE.after - META.height;
  const meta = addLine(META);
  fillWords(meta, left, left + between([0.25, 0.4]) * (right - left), [40, 90]);
  y += META.height + META.after;

  const blocks = [
    () => {
      const n = count([2, 4]);
      return {
        height: n * BODY.pitch,
        draw: () => {
          for (let i = 0; i < n; i += 1) {
            fillWords(addLine(BODY), left, ragged(i === n - 1), WORD_WIDTH);
            y += BODY.pitch;
          }
        },
      };
    },
    () => {
      const n = count([2, 4]);
      return {
        height: n * BODY.pitch,
        draw: () => {
          for (let i = 0; i < n; i += 1) {
            const line = addLine(BODY);
            words.push({
              line,
              x0: left + 8,
              x1: left + 8 + BULLET_SIZE,
              height: BULLET_SIZE,
            });
            const end =
              left +
              BULLET_INDENT +
              between([0.3, 0.8]) * (right - left - BULLET_INDENT);
            fillWords(line, left + BULLET_INDENT, end, WORD_WIDTH);
            y += BODY.pitch;
          }
        },
      };
    },
    () => {
      const n = count([3, 5]);
      return {
        height: n * CODE.pitch + CODE_PADDING * 2,
        draw: () => {
          y += CODE_PADDING;
          let depth = 0;
          for (let i = 0; i < n; i += 1) {
            const line = addLine(CODE, true);
            const from = left + CODE_PADDING + depth * CODE.indent;
            fillWords(
              line,
              from,
              from + between([0.25, 0.6]) * (right - from),
              CODE_WORD_WIDTH,
            );
            depth = Math.max(0, Math.min(3, depth + count([-1, 1])));
            y += CODE.pitch;
          }
          y += CODE_PADDING;
        },
      };
    },
  ];

  for (;;) {
    const block = blocks[Math.floor(random() * blocks.length)]!();
    if (y + HEADING.height + HEADING.after + block.height > bottom) {
      break;
    }
    const heading = addLine(HEADING);
    words.push({
      line: heading,
      x0: left,
      x1: left + between([0.2, 0.45]) * (right - left),
      height: HEADING.height,
    });
    y += HEADING.height + HEADING.after - BODY.height;
    block.draw();
    y += SECTION_GAP;
  }
  return {lines, words};
};

export const createWritingScript = (
  seed: number,
  totalMs: number,
): WritingScript => {
  const random = mulberry32(seed);
  const between = ([lo, hi]: readonly [number, number]) =>
    lo + (hi - lo) * random();
  const {lines, words} = layoutPage(random);

  const beats: Beat[] = [];
  const intervals: number[] = [];
  let cursor = 0;
  while (cursor < words.length) {
    cursor = Math.min(words.length, cursor + between(CHUNK_WORDS));
    const index = Math.min(words.length - 1, Math.floor(cursor));
    const fraction = cursor >= words.length ? 1 : cursor - index;
    const word = words[index]!;
    beats.push({
      at: 0,
      line: word.line,
      x: word.x0 + fraction * (word.x1 - word.x0),
    });
    intervals.push(
      random() < PAUSE_CHANCE ? between(PAUSE_MS) : between(FLOW_MS),
    );
  }
  const sum = intervals.reduce((a, b) => a + b, 0);
  let at = 0;
  for (const [index, beat] of beats.entries()) {
    at += (intervals[index]! * totalMs) / sum;
    beat.at = at;
  }
  return {lines, words, beats};
};

export const cursorAt = (
  script: WritingScript,
  beatCount: number,
): {line: number; x: number} =>
  beatCount > 0 ? script.beats[beatCount - 1]! : {line: 0, x: PAGE.margin};

export const paintPage = (
  ctx: CanvasRenderingContext2D,
  script: WritingScript,
  beatCount: number,
): void => {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE.width, PAGE.height);
  const cursor = cursorAt(script, beatCount);
  if (beatCount === 0) {
    return;
  }
  ctx.fillStyle = CODE_SHADE;
  for (const [index, line] of script.lines.entries()) {
    if (index > cursor.line) {
      break;
    }
    if (line.shaded) {
      const first = !script.lines[index - 1]?.shaded;
      const last = !script.lines[index + 1]?.shaded;
      const top = line.y - CODE.pitch / 2 - (first ? CODE_PADDING : 0);
      const bottom = line.y + CODE.pitch / 2 + (last ? CODE_PADDING : 0);
      ctx.fillRect(
        PAGE.margin,
        top,
        PAGE.width - PAGE.margin * 2,
        bottom - top,
      );
    }
  }
  for (const word of script.words) {
    if (word.line > cursor.line) {
      break;
    }
    const x1 =
      word.line === cursor.line ? Math.min(word.x1, cursor.x) : word.x1;
    const width = x1 - word.x0;
    if (width <= 0) {
      continue;
    }
    const line = script.lines[word.line]!;
    ctx.fillStyle = line.color;
    ctx.fillRect(word.x0, line.y - word.height / 2, width, word.height);
  }
};
