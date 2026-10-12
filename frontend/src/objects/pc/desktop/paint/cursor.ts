import {CURSOR_ARROW_PATH} from "../../../../core/input/virtualCursor";

let arrow: Path2D | null = null;

export const paintCursor = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void => {
  arrow ??= new Path2D(CURSOR_ARROW_PATH);
  ctx.save();
  ctx.translate(Math.round(x) - 1, Math.round(y) - 1);
  ctx.fillStyle = "#ffffff";
  ctx.fill(arrow);
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000000";
  ctx.stroke(arrow);
  ctx.restore();
};
