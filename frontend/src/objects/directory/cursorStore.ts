import {mouseSettingsStore} from "../../core/input/mouseSettings";
import {createVirtualCursor} from "../../core/input/virtualCursor";

const cursor = createVirtualCursor();

export const getCursor = cursor.get;

export const resetCursor = cursor.reset;

export const moveOverviewCursor = (
  dx: number,
  dy: number,
  viewport: {width: number; height: number},
): void => {
  const k = mouseSettingsStore.getState().sensitivity;
  cursor.move(dx * k, dy * k, viewport);
};

export const subscribeCursor = cursor.subscribe;
