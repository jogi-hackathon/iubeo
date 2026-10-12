import type {IconName} from "../kernel/app";
import settingsSvg from "./icons/settings.svg?raw";
import startSvg from "./icons/start.svg?raw";
import terminalSvg from "./icons/terminal.svg?raw";

/** スタートボタンの印も含めた、描けるアイコン */
export type PaintableIcon = IconName | "start";

// 16×16 のドット絵を SVG で持つ(./icons/。マス目に沿った四角だけで描き、shape-rendering="crispEdges" でぼかさない)
const SOURCES: Record<PaintableIcon, string> = {
  terminal: terminalSvg,
  settings: settingsSvg,
  start: startSvg,
};

const images = new Map<PaintableIcon, HTMLImageElement>();
let loading: Promise<void> | null = null;

/**
 * アイコンの SVG を画像として読み込む(一度だけ)。読み込み終わるまで paintIcon は何も描かないので、
 * 描く側は終わったら描き直す(DesktopScreen)
 */
export const loadIcons = (): Promise<void> => {
  loading ??= Promise.all(
    (Object.keys(SOURCES) as PaintableIcon[]).map(async (name) => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SOURCES[name])}`;
      await image.decode();
      images.set(name, image);
    }),
  ).then(() => undefined);
  return loading;
};

const cache = new Map<string, HTMLCanvasElement>();

const render = (
  name: PaintableIcon,
  size: number,
  tint: string | null,
): HTMLCanvasElement | null => {
  const key = `${name}@${size}:${tint ?? ""}`;
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }
  const image = images.get(name);
  const base = tint ? render(name, size, null) : null;
  if (!image || (tint && !base)) {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx && base && tint) {
    // アイコンの画素にだけ色を半分かぶせる(デスクトップで選んだアイコン)
    ctx.drawImage(base, 0, 0);
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, size, size);
  } else if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, size, size);
  }
  cache.set(key, canvas);
  return canvas;
};

/**
 * アイコンを描く。size は 16 か 32。tint を渡すと、アイコンの画素にだけその色を半分かぶせる。
 * SVG を読み込み終わる前(loadIcons)は何も描かない
 */
export const paintIcon = (
  ctx: CanvasRenderingContext2D,
  name: PaintableIcon,
  x: number,
  y: number,
  size: 16 | 32 = 32,
  tint: string | null = null,
): void => {
  const icon = render(name, size, tint);
  if (icon) {
    ctx.drawImage(icon, x, y);
  }
};
