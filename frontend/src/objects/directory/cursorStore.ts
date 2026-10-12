import {createVirtualCursor} from "../../core/input/virtualCursor";

const cursor = createVirtualCursor();

export const getCursor = cursor.get;

export const resetCursor = cursor.reset;

export const moveOverviewCursor = (
  dx: number,
  dy: number,
  viewport: {width: number; height: number},
): void => {
  cursor.move(dx, dy, viewport);
};

export const subscribeCursor = cursor.subscribe;
