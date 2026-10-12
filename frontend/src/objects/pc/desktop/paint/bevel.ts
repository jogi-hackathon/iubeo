import type {Rect} from "../kernel/geometry";
import {COLORS} from "../theme/classic";

/** 1px の線を、左上(tl)と右下(br)で色を変えて四角に引く */
const edge = (
  ctx: CanvasRenderingContext2D,
  r: Rect,
  tl: string,
  br: string,
): void => {
  ctx.fillStyle = tl;
  ctx.fillRect(r.x, r.y, r.width - 1, 1);
  ctx.fillRect(r.x, r.y, 1, r.height - 1);
  ctx.fillStyle = br;
  ctx.fillRect(r.x, r.y + r.height - 1, r.width, 1);
  ctx.fillRect(r.x + r.width - 1, r.y, 1, r.height);
};

const inset = (r: Rect, by = 1): Rect => ({
  x: r.x + by,
  y: r.y + by,
  width: r.width - by * 2,
  height: r.height - by * 2,
});

/** 浮き出たボタン・窓の枠(押しているときはへこむ) */
export const raised = (
  ctx: CanvasRenderingContext2D,
  r: Rect,
  pressed = false,
): void => {
  ctx.fillStyle = COLORS.face;
  ctx.fillRect(r.x, r.y, r.width, r.height);
  if (pressed) {
    edge(ctx, r, COLORS.darkShadow, COLORS.highlight);
    edge(ctx, inset(r), COLORS.shadow, COLORS.face);
    return;
  }
  edge(ctx, r, COLORS.highlight, COLORS.darkShadow);
  edge(ctx, inset(r), COLORS.face, COLORS.shadow);
};

/** へこんだ 1 段の枠(タスクバーの時計の欄など) */
export const sunkenThin = (ctx: CanvasRenderingContext2D, r: Rect): void => {
  edge(ctx, r, COLORS.shadow, COLORS.highlight);
};

/** へこんだ 2 段の枠(入力欄・一覧など) */
export const sunken = (ctx: CanvasRenderingContext2D, r: Rect): void => {
  edge(ctx, r, COLORS.shadow, COLORS.highlight);
  edge(ctx, inset(r), COLORS.darkShadow, COLORS.face);
};

/** 彫った区切り線(横) */
export const etchedLine = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
): void => {
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(x, y, width, 1);
  ctx.fillStyle = COLORS.highlight;
  ctx.fillRect(x, y + 1, width, 1);
};
