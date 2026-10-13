import type {Rect} from "../kernel/geometry";
import {COLORS, FONT} from "../theme/classic";
import type {Button, Dropdown, Slider, Tabs} from "../toolkit/controls";
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

export const paintLevelMeter = (
  ctx: CanvasRenderingContext2D,
  r: Rect,
  segments: number,
  lit: number,
): void => {
  sunken(ctx, r);
  const inner = {
    x: r.x + 3,
    y: r.y + 3,
    width: r.width - 6,
    height: r.height - 6,
  };
  ctx.fillStyle = COLORS.window;
  ctx.fillRect(inner.x, inner.y, inner.width, inner.height);
  const pitch = inner.width / segments;
  ctx.fillStyle = COLORS.selection;
  for (let i = 0; i < Math.min(lit, segments); i++) {
    ctx.fillRect(
      Math.round(inner.x + i * pitch),
      inner.y,
      Math.max(1, Math.floor(pitch) - 1),
      inner.height,
    );
  }
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

export const paintTabs = (
  ctx: CanvasRenderingContext2D,
  tabs: Tabs,
  labels: readonly string[],
  panel: Rect,
): void => {
  raised(ctx, panel);
  ctx.fillStyle = COLORS.face;
  ctx.fillRect(panel.x + 2, panel.y + 2, panel.width - 4, panel.height - 4);
  const selected = tabs.selected();
  const order = [
    ...labels.map((_, i) => i).filter((i) => i !== selected),
    selected,
  ];
  for (const i of order) {
    const base = tabs.tabRect(i);
    const active = i === selected;
    const r = active
      ? {
          x: base.x - 2,
          y: base.y - 2,
          width: base.width + 4,
          height: base.height + 3,
        }
      : {x: base.x, y: base.y, width: base.width, height: base.height};
    ctx.fillStyle = COLORS.face;
    ctx.fillRect(r.x, r.y, r.width, r.height);
    ctx.fillStyle = COLORS.highlight;
    ctx.fillRect(r.x, r.y + 2, 1, r.height - 2);
    ctx.fillRect(r.x + 1, r.y + 1, 1, 1);
    ctx.fillRect(r.x + 2, r.y, r.width - 4, 1);
    ctx.fillStyle = COLORS.darkShadow;
    ctx.fillRect(r.x + r.width - 1, r.y + 2, 1, r.height - 2);
    ctx.fillRect(r.x + r.width - 2, r.y + 1, 1, 1);
    ctx.fillStyle = COLORS.shadow;
    ctx.fillRect(r.x + r.width - 2, r.y + 2, 1, r.height - 2);
    ctx.font = FONT;
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.text;
    ctx.fillText(labels[i]!, r.x + r.width / 2, base.y + base.height / 2 + 1);
    ctx.textAlign = "left";
  }
};

export const paintDropdown = <T>(
  ctx: CanvasRenderingContext2D,
  dropdown: Dropdown<T>,
): void => {
  const r = dropdown.rect;
  const enabled = dropdown.enabled();
  ctx.fillStyle = enabled ? COLORS.window : COLORS.face;
  ctx.fillRect(r.x, r.y, r.width, r.height);
  sunken(ctx, r);
  const arrow = {
    x: r.x + r.width - 2 - 16,
    y: r.y + 2,
    width: 16,
    height: r.height - 4,
  };
  raised(ctx, arrow, dropdown.open());
  const o = dropdown.open() ? 1 : 0;
  const ax = arrow.x + arrow.width / 2 + o;
  const ay = arrow.y + arrow.height / 2 + o;
  ctx.fillStyle = enabled ? COLORS.text : COLORS.grayText;
  ctx.beginPath();
  ctx.moveTo(ax - 4, ay - 2);
  ctx.lineTo(ax + 4, ay - 2);
  ctx.lineTo(ax, ay + 2);
  ctx.closePath();
  ctx.fill();
  ctx.font = FONT;
  ctx.fillText(
    dropdown.selectedLabel(),
    r.x + 5,
    r.y + r.height / 2 + 1,
    arrow.x - r.x - 8,
  );
};

export const paintDropdownList = <T>(
  ctx: CanvasRenderingContext2D,
  dropdown: Dropdown<T>,
): void => {
  const list = dropdown.popup?.();
  if (!list) {
    return;
  }
  ctx.fillStyle = COLORS.window;
  ctx.fillRect(list.x, list.y, list.width, list.height);
  ctx.strokeStyle = COLORS.text;
  ctx.lineWidth = 1;
  ctx.strokeRect(list.x + 0.5, list.y + 0.5, list.width - 1, list.height - 1);
  ctx.font = FONT;
  dropdown.choices().forEach((choice, i) => {
    const r = dropdown.itemRect(i);
    const lit = i === dropdown.highlighted();
    if (lit) {
      ctx.fillStyle = COLORS.selection;
      ctx.fillRect(r.x, r.y, r.width, r.height);
    }
    ctx.fillStyle = lit ? COLORS.selectionText : COLORS.text;
    ctx.fillText(choice.label, r.x + 4, r.y + r.height / 2 + 1, r.width - 8);
  });
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
