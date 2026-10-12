import {describe, expect, it} from "vitest";

import {
  CRASH_RESTART_LIMIT,
  CRASH_RESTART_WINDOW_MS,
  isEngineCrashLine,
  isResumablePage,
  takeRestartBudget,
} from "../engineCrash";

describe("isEngineCrashLine", () => {
  it("実際に出た wasm のクラッシュ行を拾う", () => {
    expect(
      isEngineCrashLine(
        "Pthread 0x0cd91000 sent an error! blob:https://x/y:6000: Uncaught RuntimeError: table index is out of bounds",
      ),
    ).toBe(true);
    expect(isEngineCrashLine("Uncaught RuntimeError: memory access")).toBe(
      true,
    );
    expect(isEngineCrashLine("Aborted(OOM)")).toBe(true);
  });

  it("ふつうのログは拾わない", () => {
    expect(isEngineCrashLine("xul_load: 960x664 url=https://x")).toBe(false);
    expect(
      isEngineCrashLine("warning: unsupported syscall: __syscall_madvise"),
    ).toBe(false);
  });
});

describe("takeRestartBudget", () => {
  it("上限までは再起動を許し、超えたら止める", () => {
    let history: number[] = [];
    for (let i = 0; i < CRASH_RESTART_LIMIT; i++) {
      const budget = takeRestartBudget(history, 1000 + i);
      expect(budget.allowed).toBe(true);
      history = budget.history;
    }
    const blocked = takeRestartBudget(history, 1100);
    expect(blocked.allowed).toBe(false);
  });

  it("窓の外に出た古い再起動は数えない", () => {
    const history = [0, 1, 2];
    const later = takeRestartBudget(history, CRASH_RESTART_WINDOW_MS + 10);
    expect(later.allowed).toBe(true);
    expect(later.history).toEqual([CRASH_RESTART_WINDOW_MS + 10]);
  });
});

describe("isResumablePage", () => {
  it("http(s) のページは読み直せる", () => {
    expect(isResumablePage("https://go.dev/")).toBe(true);
    expect(isResumablePage("http://example.com/a?b=c")).toBe(true);
  });

  it("スタートページ(data:)や about: は読み直さない", () => {
    expect(isResumablePage("data:text/html;base64,PGh0bWw+")).toBe(false);
    expect(isResumablePage("about:blank")).toBe(false);
    expect(isResumablePage("")).toBe(false);
  });
});
