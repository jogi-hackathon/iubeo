/**
 * pointer lock のまま動かす仮想カーソル。位置は -1〜1(x は右、y は上)で持ち、
 * マウスの移動量(ピクセル)を、カーソルが動く範囲の見かけの大きさ(viewport)で割って足す。
 * 俯瞰ビューは画面全体、PC は画面に映っている範囲を viewport にする
 */
export type Cursor = {x: number; y: number};

export const CENTER_CURSOR: Readonly<Cursor> = {x: 0, y: 0};

/** 矢印の形(16×24 の SVG パス)。DOM の SVG にも canvas の Path2D にもそのまま使える */
export const CURSOR_ARROW_PATH =
  "M1 1 L1 19 L5.2 15 L8.4 22.4 L11.4 21.1 L8.2 13.9 L14 13.9 Z";

const clamp = (v: number): number => Math.max(-1, Math.min(1, v));

export const moveCursor = (
  cursor: Cursor,
  dx: number,
  dy: number,
  viewport: {width: number; height: number},
): Cursor => {
  cursor.x = clamp(cursor.x + (dx / viewport.width) * 2);
  cursor.y = clamp(cursor.y - (dy / viewport.height) * 2);
  return cursor;
};

export const createVirtualCursor = () => {
  const cursor: Cursor = {...CENTER_CURSOR};
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const l of Array.from(listeners)) {
      l();
    }
  };

  return {
    get: (): Readonly<Cursor> => cursor,
    reset: (): void => {
      if (cursor.x !== CENTER_CURSOR.x || cursor.y !== CENTER_CURSOR.y) {
        cursor.x = CENTER_CURSOR.x;
        cursor.y = CENTER_CURSOR.y;
        notify();
      }
    },
    /** 動いたときだけ通知し、true を返す */
    move: (
      dx: number,
      dy: number,
      viewport: {width: number; height: number},
    ): boolean => {
      const x = cursor.x;
      const y = cursor.y;
      moveCursor(cursor, dx, dy, viewport);
      if (cursor.x === x && cursor.y === y) {
        return false;
      }
      notify();
      return true;
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export type VirtualCursor = ReturnType<typeof createVirtualCursor>;
