import {CENTER_CURSOR, type Cursor, moveCursor} from "./cursor";

// 俯瞰の仮想カーソルの位置。毎フレーム動くので React の状態にはせず、DOM 側(OverviewCursor)が
// 購読して style を直接書き換える。変わったときだけ通知する
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
