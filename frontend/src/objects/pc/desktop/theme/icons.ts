import type {IconName} from "../kernel/app";

type PixelIcon = {palette: Record<string, string>; rows: readonly string[]};

// 16×16 のドット絵。"." は透明
const ICONS: Record<IconName | "logo", PixelIcon> = {
  matchmaking: {
    palette: {k: "#000000", B: "#9a9a9a", b: "#5a5a5a", g: "#e0e0e0"},
    rows: [
      "................",
      ".....kkkkkk.....",
      "...kkBBggBBkk...",
      "..kBBggggBBBBk..",
      ".kBBgggggBBBBBk.",
      ".kBBBgggBBBggBk.",
      "kBBBBBggBBggggBk",
      "kBBBBBBgBgggggbk",
      "kbBBBBBBBggggbbk",
      "kbbBBBBBBBgggbbk",
      ".kbbBBggBBBggbk.",
      ".kbbbbgggBBbbbk.",
      "..kbbbbggbbbbk..",
      "...kkbbbbbbkk...",
      ".....kkkkkk.....",
      "................",
    ],
  },
  settings: {
    palette: {k: "#000000", w: "#ffffff", s: "#808080"},
    rows: [
      "......kkkk......",
      "...kk.kwwk.kk...",
      "..kwwkkwwkkwwk..",
      "..kwwwwwwwwwsk..",
      "...kwwwkkwwsk...",
      "kkkwwwk..kwsskkk",
      "kwwwwk....kssssk",
      "kwwwwk....kssssk",
      "kwwwsk....kssssk",
      "kkkwssk..kssskkk",
      "...kwsskkssssk..",
      "..kwssssssssk...",
      "..ksskksskkssk..",
      "...kk.kssk.kk...",
      "......kkkk......",
      "................",
    ],
  },
  logo: {
    palette: {k: "#000000", w: "#ffffff", b: "#2a2a2a", c: "#c8c8c8"},
    rows: [
      "................",
      "................",
      ".kkkkkkkkkkkkk..",
      ".kwwwwwwwwwwwk..",
      ".kwbbbbbbbbbwk..",
      ".kwbcbbbbbbbwk..",
      ".kwbbcbbbbbbwk..",
      ".kwbbbbbbbbbwk..",
      ".kwbbbbbbbbbwk..",
      ".kwwwwwwwwwwwk..",
      ".kkkkkkkkkkkkk..",
      "......kwk.......",
      "....kkkkkkk.....",
      "................",
      "................",
      "................",
    ],
  },
};

const cache = new Map<string, HTMLCanvasElement>();

const render = (
  name: IconName | "logo",
  scale: number,
  tint: string | null,
): HTMLCanvasElement => {
  const key = `${name}@${scale}:${tint ?? ""}`;
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }
  const {palette, rows} = ICONS[name];
  const canvas = document.createElement("canvas");
  canvas.width = 16 * scale;
  canvas.height = 16 * scale;
  const ctx = canvas.getContext("2d");
  if (ctx && tint) {
    // アイコンの画素にだけ色を半分かぶせる(デスクトップで選んだアイコン)
    ctx.drawImage(render(name, scale, null), 0, 0);
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (ctx) {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const color = palette[row[x] ?? "."];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
    });
  }
  cache.set(key, canvas);
  return canvas;
};

/** アイコンを描く。size は 16 か 32。tint を渡すと、アイコンの画素にだけその色を半分かぶせる */
export const paintIcon = (
  ctx: CanvasRenderingContext2D,
  name: IconName | "logo",
  x: number,
  y: number,
  size: 16 | 32 = 32,
  tint: string | null = null,
): void => {
  ctx.drawImage(render(name, size / 16, tint), x, y);
};
