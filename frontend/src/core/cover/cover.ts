import {coverStore} from "./coverStore";

/** 覆いのフェードイン(ms)。覆い切るまで待つ時間 */
export const COVER_IN_MS = 300;
/** 覆いのフェードアウト(ms)。CSS の .cover-overlay と合わせる */
export const COVER_OUT_MS = 500;
/** 覆った後、準備を待っている間に進捗バーを出すまでの時間(速い遷移ではバーを出さない) */
export const COVER_BAR_DELAY_MS = 500;

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
    if (!coverStore.getState().covered) {
      coverStore.hideBar();
    }
  }, COVER_OUT_MS);
};

/**
 * 出ている進捗バーを 100% まで伸ばす。伸び切るのを待たない。
 * バーの伸び(CSS の transition)は覆いのフェードアウトと同時に走るので、フェードが終わる頃には 100% に着いている。
 * 待つと、その分だけそのまま操作できない時間が伸びる(起動・シーンの遷移のどちらでも毎回払う)。
 * バーが出ていなければ何もしない
 */
export const completeBar = (): void => {
  const bar = coverStore.getState().bar;
  if (bar === null) {
    return;
  }
  coverStore.setBar(bar.total, bar.total);
};

/** 起動の覆いを外し、シーンの遷移を始められるようにする。進捗バーを 100% にしてから外す */
export const finishBootCover = (): void => {
  completeBar();
  coverStore.finishBoot();
  uncoverScreen();
};

/**
 * ready が終わるまで待つ。覆ったまま COVER_BAR_DELAY_MS 以上かかったら、単一の段階(シーンの準備)の進捗バーを出す。
 * 終わったら、バーが出ていれば 100% にする(覆いは外さない。バーは覆いと一緒にフェードアウトさせる)。
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
  completeBar();
};
