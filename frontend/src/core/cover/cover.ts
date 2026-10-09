import {coverStore} from "./coverStore";

/** 覆いのフェードイン(ms)。覆い切るまで待つ時間 */
export const COVER_IN_MS = 300;
/** 覆いのフェードアウト(ms)。CSS の .cover-overlay と合わせる */
export const COVER_OUT_MS = 500;
/** 覆った後、準備を待っている間に進捗バーを出すまでの時間(速い遷移ではバーを出さない) */
export const COVER_BAR_DELAY_MS = 500;
/** 進捗バーが 100% まで伸び切る時間(ms)。CSS の .cover-bar-fill の transition と合わせる */
export const BAR_FILL_MS = 400;
/** バーが 100% に達したあと、覆いを外し始めるまで止めておく時間(ms) */
export const BAR_HOLD_MS = 150;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 白い覆いで画面を覆う。フェードインが終わったら resolve する */
export const coverScreen = async (): Promise<void> => {
  coverStore.setCovered(true);
  await sleep(COVER_IN_MS);
};

/** 覆いを外す(フェードアウトは CSS で行う)。進捗バーは白と一緒にフェードアウトさせ、終わったら消す */
export const uncoverScreen = (): void => {
  coverStore.setCovered(false);
  setTimeout(() => {
    // フェードアウトの間に覆い直していたら、そちらのバーなので消さない
    if (!coverStore.getState().covered) {
      coverStore.hideBar();
    }
  }, COVER_OUT_MS);
};

/**
 * 出ている進捗バーを 100% まで伸ばし切り、少し止めてから resolve する(バーが進んでいる途中でフェードを始めない)。
 * バーが出ていなければ、すぐ resolve する
 */
export const completeBar = async (): Promise<void> => {
  const bar = coverStore.getState().bar;
  if (bar === null) {
    return;
  }
  coverStore.setBar(bar.total, bar.total);
  await sleep(BAR_FILL_MS + BAR_HOLD_MS);
};

/** 起動の覆いを外し、シーンの遷移を始められるようにする。進捗バーを 100% にしてから外す */
export const finishBootCover = async (): Promise<void> => {
  await completeBar();
  coverStore.finishBoot();
  uncoverScreen();
};

/**
 * ready が終わるまで待つ。覆ったまま COVER_BAR_DELAY_MS 以上かかったら、単一の段階(シーンの準備)の進捗バーを出す。
 * 終わったら、バーが出ていれば 100% まで伸ばし切ってから resolve する(覆いは外さない。バーは覆いと一緒にフェードアウトさせる)。
 * ready が終わらなければ、ずっと覆ったまま待つ。ready が reject したら、バーを消して例外を伝える
 */
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
