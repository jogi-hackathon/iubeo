import {CENTER_CURSOR, type Cursor, moveCursor} from "./cursor";

const cursor: Cursor = {...CENTER_CURSOR};
const listeners = new Set<() => void>();

const notify = () => {
  for (const l of Array.from(listeners)) {
    l();
  }
};

export const getCursor = (): Readonly<Cursor> => cursor;

export const resetCursor = (): void => {
  if (cursor.x !== CENTER_CURSOR.x || cursor.y !== CENTER_CURSOR.y) {
    cursor.x = CENTER_CURSOR.x;
    cursor.y = CENTER_CURSOR.y;
    notify();
  }
};

export const moveOverviewCursor = (
  dx: number,
  dy: number,
  viewport: {width: number; height: number},
): void => {
  const x = cursor.x;
  const y = cursor.y;
  moveCursor(cursor, dx, dy, viewport);
  if (cursor.x !== x || cursor.y !== y) {
    notify();
  }
};

export const subscribeCursor = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
