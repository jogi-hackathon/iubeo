import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {
  COVER_BAR_DELAY_MS,
  COVER_IN_MS,
  COVER_OUT_MS,
  coverScreen,
  finishBootCover,
  showBarWhileWaiting,
  uncoverScreen,
} from "../cover";
import {coverStore} from "../coverStore";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return {promise, resolve};
};

beforeEach(() => {
  vi.useFakeTimers();
  coverStore.setCovered(true);
  coverStore.hideBar();
});

afterEach(() => {
  vi.useRealTimers();
  coverStore.setCovered(false);
});

describe("coverScreen / uncoverScreen", () => {
  it("覆うと covered になり、フェードインの時間が経ってから resolve する", async () => {
    let done = false;
    const p = coverScreen().then(() => {
      done = true;
    });
    expect(coverStore.getState().covered).toBe(true);

    await vi.advanceTimersByTimeAsync(COVER_IN_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
  });

  it("外すと covered が false になる。進捗バーはフェードアウトの間は残し、終わったら消す", async () => {
    coverStore.setCovered(true);
    coverStore.setBar(1, 0);
    uncoverScreen();
    expect(coverStore.getState().covered).toBe(false);
    expect(coverStore.getState().bar).not.toBeNull();

    await vi.advanceTimersByTimeAsync(COVER_OUT_MS);
    expect(coverStore.getState().bar).toBeNull();
  });

  it("フェードアウトの間に覆い直したら、そのあとのバーは消さない", async () => {
    coverStore.setCovered(true);
    uncoverScreen();
    coverStore.setCovered(true);
    coverStore.setBar(1, 0);

    await vi.advanceTimersByTimeAsync(COVER_OUT_MS);
    expect(coverStore.getState().bar).not.toBeNull();
  });
});

describe("finishBootCover", () => {
  it("進捗バーを 100% にして、待たずに起動を終えて覆いを外す", () => {
    coverStore.setCovered(true);
    coverStore.setBar(6, 5);
    finishBootCover();

    // バーの伸びを待たない(フェードアウトと同時に走らせる)
    expect(coverStore.getState()).toMatchObject({
      covered: false,
      booting: false,
      bar: {total: 6, done: 6},
    });
  });
});

describe("showBarWhileWaiting", () => {
  it("準備が速ければ、バーは出さない", async () => {
    const gate = deferred();
    const p = showBarWhileWaiting(gate.promise);
    await vi.advanceTimersByTimeAsync(COVER_BAR_DELAY_MS - 1);
    gate.resolve();
    await p;
    expect(coverStore.getState().bar).toBeNull();
  });

  it("準備が遅ければ、COVER_BAR_DELAY_MS のあとにバーを出し、終わったら 100% にする", async () => {
    const gate = deferred();
    const p = showBarWhileWaiting(gate.promise);

    await vi.advanceTimersByTimeAsync(COVER_BAR_DELAY_MS - 1);
    expect(coverStore.getState().bar).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(coverStore.getState().bar).toMatchObject({total: 1, done: 0});

    gate.resolve();
    await p;
    expect(coverStore.getState().bar).toMatchObject({total: 1, done: 1});
  });

  it("準備が終わっても覆いは外さない(バーを 100% にしても covered のまま)", async () => {
    coverStore.setCovered(true);
    const gate = deferred();
    const p = showBarWhileWaiting(gate.promise);
    await vi.advanceTimersByTimeAsync(COVER_BAR_DELAY_MS * 10);
    expect(coverStore.getState().covered).toBe(true);
    gate.resolve();
    await p;
    expect(coverStore.getState().covered).toBe(true);
  });

  it("準備が reject しても、バーは消して例外を伝える", async () => {
    const p = showBarWhileWaiting(Promise.reject(new Error("x")));
    await expect(p).rejects.toThrow("x");
    expect(coverStore.getState().bar).toBeNull();
  });
});
