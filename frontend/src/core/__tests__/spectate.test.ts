import {afterEach, describe, expect, it, vi} from "vitest";

import {
  beginElimination,
  ELIMINATION_MS,
  getSpectatePhase,
  isEliminated,
  isSpectating,
  resetSpectate,
  subscribeSpectate,
} from "../spectate";

describe("spectate", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetSpectate();
  });

  it("脱落の演出の後、観戦に移る", () => {
    vi.useFakeTimers();
    expect(getSpectatePhase()).toBe("alive");
    expect(isEliminated()).toBe(false);

    beginElimination();
    expect(getSpectatePhase()).toBe("eliminating");
    expect(isEliminated()).toBe(true);
    expect(isSpectating()).toBe(false);

    vi.advanceTimersByTime(ELIMINATION_MS);
    expect(getSpectatePhase()).toBe("spectating");
    expect(isSpectating()).toBe(true);
  });

  it("二度呼んでも、演出は延びない(1 回だけ効く)", () => {
    vi.useFakeTimers();
    beginElimination();
    vi.advanceTimersByTime(ELIMINATION_MS / 2);
    beginElimination();
    vi.advanceTimersByTime(ELIMINATION_MS / 2);
    expect(getSpectatePhase()).toBe("spectating");
  });

  it("resetSpectate で通常に戻る", () => {
    vi.useFakeTimers();
    beginElimination();
    vi.advanceTimersByTime(ELIMINATION_MS);
    resetSpectate();
    expect(getSpectatePhase()).toBe("alive");
    expect(isEliminated()).toBe(false);
    expect(isSpectating()).toBe(false);
  });

  it("状態が変わると購読者に通知する", () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    subscribeSpectate(listener);
    beginElimination();
    vi.advanceTimersByTime(ELIMINATION_MS);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
