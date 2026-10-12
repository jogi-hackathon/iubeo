import type {Rect} from "../kernel/geometry";
import {COLORS, FONT} from "../theme/classic";
import type {Button, Slider} from "../toolkit/controls";
import {raised, sunken, sunkenThin} from "./bevel";

export const paintButton = (
  ctx: CanvasRenderingContext2D,
  button: Button,
  label: string,
  {isDefault = false}: {isDefault?: boolean} = {},
): void => {
  const r = button.rect;
  const pressed = button.pressed();
  const enabled = button.enabled();
  if (isDefault) {
    ctx.fillStyle = COLORS.text;
    ctx.fillRect(r.x, r.y, r.width, r.height);
    raised(
      ctx,
      {x: r.x + 1, y: r.y + 1, width: r.width - 2, height: r.height - 2},
      pressed,
    );
  } else {
    raised(ctx, r, pressed);
  }
  const o = pressed ? 1 : 0;
  const cx = r.x + r.width / 2 + o;
  const cy = r.y + r.height / 2 + 1 + o;
  ctx.font = FONT;
  ctx.textAlign = "center";
  if (!enabled) {
    ctx.fillStyle = COLORS.highlight;
    ctx.fillText(label, cx + 1, cy + 1, r.width - 8);
    ctx.fillStyle = COLORS.grayText;
  } else {
    ctx.fillStyle = COLORS.text;
  }
  ctx.fillText(label, cx, cy, r.width - 8);
  ctx.textAlign = "left";
};

export const paintSlider = (
  ctx: CanvasRenderingContext2D,
  slider: Slider,
  ticks: number,
): void => {
  const r = slider.rect;
  const grooveY = r.y + 8;
  sunken(ctx, {x: r.x + 2, y: grooveY, width: r.width - 4, height: 4});

  ctx.fillStyle = COLORS.text;
  const left = r.x + 6;
  const width = r.width - 12;
  for (let i = 0; i <= ticks; i++) {
    const x = Math.round(left + (width * i) / ticks);
    ctx.fillRect(x, r.y + 24, 1, i === 0 || i === ticks ? 4 : 3);
  }

  const thumb = {
    x: Math.round(slider.thumbX()) - 5,
    y: r.y,
    width: 11,
    height: 20,
  };
  raised(ctx, thumb);
};

export const paintMarquee = (
  ctx: CanvasRenderingContext2D,
  r: Rect,
  t: number,
): void => {
  sunkenThin(ctx, r);
  ctx.fillStyle = COLORS.window;
  ctx.fillRect(r.x + 1, r.y + 1, r.width - 2, r.height - 2);
  const block = 8;
  const gap = 2;
  const count = 5;
  const span = r.width + count * (block + gap);
  const head = ((t * 120) % span) - count * (block + gap);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x + 2, r.y + 2, r.width - 4, r.height - 4);
  ctx.clip();
  ctx.fillStyle = COLORS.selection;
  for (let i = 0; i < count; i++) {
    ctx.fillRect(
      Math.round(r.x + 2 + head + i * (block + gap)),
      r.y + 2,
      block,
      r.height - 4,
    );
  }
  ctx.restore();
};

export const paintGroup = (
  ctx: CanvasRenderingContext2D,
  r: Rect,
  title: string,
): void => {
  const top = r.y + 6;
  ctx.strokeStyle = COLORS.shadow;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, top + 0.5, r.width - 2, r.height - 8);
  ctx.strokeStyle = COLORS.highlight;
  ctx.strokeRect(r.x + 1.5, top + 1.5, r.width - 2, r.height - 8);
  ctx.font = FONT;
  const width = ctx.measureText(title).width;
  ctx.fillStyle = COLORS.face;
  ctx.fillRect(r.x + 6, r.y, width + 6, 13);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(title, r.x + 9, r.y + 7);
};

export const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] => {
  const fits = (s: string) => ctx.measureText(s).width <= maxWidth;
  const lines: string[] = [];
  let line = "";
  for (const token of text.match(/[\x21-\x7e]+|\s+|./gu) ?? []) {
    if (fits(line + token)) {
      line += token;
      continue;
    }
    if (line.trim()) {
      lines.push(line.trimEnd());
    }
    line = token.trimStart();
    while (line && !fits(line)) {
      let cut = line.length - 1;
      while (cut > 1 && !fits(line.slice(0, cut))) {
        cut--;
      }
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line.trim()) {
    lines.push(line.trimEnd());
  }
  return lines;
};
