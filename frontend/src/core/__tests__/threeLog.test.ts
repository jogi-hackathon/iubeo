import {afterEach, describe, expect, it, vi} from "vitest";

import {threeConsoleHandler} from "../threeLog";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("threeConsoleHandler", () => {
  it("R3F が出す Clock の非推奨の警告だけを落とす", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    threeConsoleHandler(
      "warn",
      "Clock: This module has been deprecated. Please use THREE.Timer instead.",
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("その他の警告・エラー・ログはそのまま出す", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    threeConsoleHandler("warn", "何か別の警告");
    threeConsoleHandler("error", "壊れた");
    threeConsoleHandler("log", "ただのログ");
    expect(warn).toHaveBeenCalledWith("何か別の警告");
    expect(error).toHaveBeenCalledWith("壊れた");
    expect(log).toHaveBeenCalledWith("ただのログ");
  });

  it("Clock の文言を含んでも、警告以外は落とさない", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    threeConsoleHandler("error", "Clock: This module has been deprecated.");
    expect(error).toHaveBeenCalled();
  });

  it("スタック付きの警告は Error にして出す(three の既定と同じ)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stack = {isStackTrace: true, getError: (m: string) => new Error(m)};
    threeConsoleHandler("warn", "TSL: 何か", stack);
    expect(warn.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({message: "TSL: 何か"});
  });
});
