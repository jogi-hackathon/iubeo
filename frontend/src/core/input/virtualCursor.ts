export type Cursor = {x: number; y: number};

export const CENTER_CURSOR: Readonly<Cursor> = {x: 0, y: 0};

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
