import {describe, expect, it} from "vitest";

import {approachCountdown, countdownTarget} from "../countdownSky";

describe("countdownTarget", () => {
  it("残り20秒より前は何も起きない", () => {
    expect(countdownTarget(30_000)).toEqual({red: 0, noise: 0});
    expect(countdownTarget(20_000)).toEqual({red: 0, noise: 0});
  });

  it("残り20秒から赤くなり始め、ノイズは残り10秒から", () => {
    const t = countdownTarget(15_000);
    expect(t.red).toBeCloseTo(0.25);
    expect(t.noise).toBe(0);
    const u = countdownTarget(5_000);
    expect(u.red).toBeCloseTo(0.75);
    expect(u.noise).toBeCloseTo(0.5);
  });

  it("締め切りを過ぎたら両方とも最大のまま", () => {
    expect(countdownTarget(0)).toEqual({red: 1, noise: 1});
    expect(countdownTarget(-3_000)).toEqual({red: 1, noise: 1});
  });

  it("残り時間が無いときは0", () => {
    expect(countdownTarget(null)).toEqual({red: 0, noise: 0});
  });
});

describe("approachCountdown", () => {
  it("上がるときはすぐに追いつく", () => {
    expect(
      approachCountdown({red: 0, noise: 0}, {red: 0.8, noise: 0.4}, 16),
    ).toEqual({red: 0.8, noise: 0.4});
  });

  it("下がるときは1秒かけて戻る", () => {
    const half = approachCountdown({red: 1, noise: 1}, {red: 0, noise: 0}, 500);
    expect(half.red).toBeCloseTo(0.5);
    expect(half.noise).toBeCloseTo(0.5);
    expect(approachCountdown(half, {red: 0, noise: 0}, 600)).toEqual({
      red: 0,
      noise: 0,
    });
  });
});
