export type Point = {x: number; y: number};

export type Size = {width: number; height: number};

export type Rect = Point & Size;

export const contains = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));
