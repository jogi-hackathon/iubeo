import {coverStore} from "./coverStore";

export const COVER_IN_MS = 300;
export const COVER_OUT_MS = 500;
export const COVER_BAR_DELAY_MS = 500;
export const BAR_FILL_MS = 400;
export const BAR_HOLD_MS = 150;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const coverScreen = async (): Promise<void> => {
  coverStore.setCovered(true);
  await sleep(COVER_IN_MS);
};

export const uncoverScreen = (): void => {
  coverStore.setCovered(false);
  setTimeout(() => {
    if (!coverStore.getState().covered) {
      coverStore.hideBar();
    }
  }, COVER_OUT_MS);
};

export const completeBar = async (): Promise<void> => {
  const bar = coverStore.getState().bar;
  if (bar === null) {
    return;
  }
  coverStore.setBar(bar.total, bar.total);
  await sleep(BAR_FILL_MS + BAR_HOLD_MS);
};

export const finishBootCover = async (): Promise<void> => {
  await completeBar();
  coverStore.finishBoot();
  uncoverScreen();
};

export const showBarWhileWaiting = async (
  ready: Promise<void>,
): Promise<void> => {
  const timer = setTimeout(() => {
    coverStore.setBar(1, 0);
  }, COVER_BAR_DELAY_MS);
  try {
    await ready;
  } catch (e) {
    clearTimeout(timer);
    coverStore.hideBar();
    throw e;
  }
  clearTimeout(timer);
  await completeBar();
};
